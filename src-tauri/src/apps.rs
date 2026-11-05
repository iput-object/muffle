//! Friendly names and icons for units, from the `.desktop` file an app unit
//! was started from. Results are cached per unit name.

use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

use base64::Engine;

#[derive(Clone, Default)]
pub struct AppInfo {
    pub name: Option<String>,
    /// `data:` URI, ready for an <img src>.
    pub icon: Option<String>,
}

#[derive(Default)]
pub struct AppCache(HashMap<String, AppInfo>);

impl AppCache {
    pub fn get(&mut self, unit: &str) -> AppInfo {
        self.0.entry(unit.to_string()).or_insert_with(|| resolve(unit)).clone()
    }
}

fn resolve(unit: &str) -> AppInfo {
    let candidates = app_id_candidates(unit);
    let entry = candidates
        .iter()
        .find_map(|id| find_desktop(id))
        .or_else(|| find_desktop_by_suffix(&candidates));
    let Some(entry) = entry else {
        return AppInfo {
            name: fallback_name(unit),
            icon: None,
        };
    };
    let (name, icon) = parse_desktop(&entry);
    AppInfo {
        name,
        icon: icon.and_then(|i| icon_data_uri(&i)),
    }
}

/// Icon for a desktop id from the installed app's own `.desktop` file, for
/// autostart entries that don't name one.
pub fn icon_for_desktop_id(id: &str) -> Option<String> {
    let (_, icon) = parse_desktop(&find_desktop(id)?);
    icon_data_uri(&icon?)
}

/// For a scope with no matching desktop file, the app id without the
/// launcher prefix and random suffix: `app-niri-noctalia-950.scope` -> `noctalia`.
fn fallback_name(unit: &str) -> Option<String> {
    let rest = unit.strip_prefix("app-")?.strip_suffix(".scope")?;
    let mut segments: Vec<&str> = rest.split('-').collect();
    if segments.len() > 1 {
        segments.pop();
    }
    segments.last().map(|s| s.replace("\\x2d", "-"))
}

// ── Identity ─────────────────────────────────────────────────────────────────

/// `app_key` per unit name, shared by the window, the tray and the CLI.
static KEYS: LazyLock<Mutex<HashMap<String, Option<String>>>> = LazyLock::new(Default::default);

/// Stable identity of the app behind an `app-*` unit, the same for every
/// launch, launcher and boot: the desktop id when its `.desktop` file is
/// found, else the app id from the unit name. Lowercase. `None` for anything
/// that isn't an app unit (plain services are identified by their name).
pub fn app_key(unit: &str) -> Option<String> {
    if !unit.starts_with("app-") {
        return None;
    }
    if let Some(key) = KEYS.lock().unwrap().get(unit) {
        return key.clone();
    }
    let key = resolve_key(unit);
    KEYS.lock().unwrap().insert(unit.to_string(), key.clone());
    key
}

fn resolve_key(unit: &str) -> Option<String> {
    let fallback = fallback_key(unit)?;
    app_id_candidates(unit)
        .iter()
        .find_map(|id| find_desktop(id))
        .or_else(|| find_desktop_by_suffix(std::slice::from_ref(&fallback)))
        .and_then(|path| Some(path.file_stem()?.to_str()?.to_lowercase()))
        .or(Some(fallback))
}

/// Whether two unit names stand for the same thing: the very same unit, or
/// two instances of the same app (`app-niri-firefox-12.scope` and
/// `app-gnome-firefox-34.scope`).
pub fn same_unit(a: &str, b: &str) -> bool {
    same_unit_by(a, b, app_key)
}

fn same_unit_by(a: &str, b: &str, key: impl Fn(&str) -> Option<String>) -> bool {
    a == b || matches!((key(a), key(b)), (Some(x), Some(y)) if x == y)
}

/// The launch an app scope belongs to: its trailing PID. One launch can span
/// several scopes when the app moves its own main process into a scope of its
/// own: Chrome launched from GNOME runs as both
/// `app-gnome-google\x2dchrome-697193.scope` (renderers, GPU, ...) and
/// `app-com.google.Chrome-697193.scope` (the browser process). They are one app.
pub fn launch_id(unit: &str) -> Option<&str> {
    let rest = unit.strip_prefix("app-")?.strip_suffix(".scope")?;
    let (_, last) = rest.rsplit_once('-')?;
    (!last.is_empty() && last.chars().all(|c| c.is_ascii_digit())).then_some(last)
}

/// Whether two units are parts of the same app launch (and not the same unit).
pub fn same_launch(a: &str, b: &str) -> bool {
    a != b && matches!((launch_id(a), launch_id(b)), (Some(x), Some(y)) if x == y)
}

/// The app id from an app unit's name alone, without the launcher prefix,
/// random suffix or instance: `app-niri-firefox-1234.scope` -> `firefox`,
/// `app-arch\x2dupdate@autostart.service` -> `arch-update`.
fn fallback_key(unit: &str) -> Option<String> {
    let rest = unit.strip_prefix("app-")?;
    let (rest, is_scope) = match rest.strip_suffix(".scope") {
        Some(r) => (r, true),
        None => (rest.strip_suffix(".service").unwrap_or(rest), false),
    };
    let rest = rest.split('@').next().unwrap_or(rest);
    let mut segments: Vec<&str> = rest.split('-').collect();
    // Scopes end in a random number or hex id.
    if is_scope && segments.len() > 1 && segments.last().is_some_and(|s| s.chars().all(|c| c.is_ascii_hexdigit())) {
        segments.pop();
    }
    segments
        .last()
        .filter(|s| !s.is_empty())
        .map(|s| s.replace("\\x2d", "-").to_lowercase())
}

/// Possible desktop ids for an app unit. systemd names them
/// `app[-<launcher>]-<id>[@<rand>].service` or `app[-<launcher>]-<id>-<rand>.scope`,
/// with dashes inside `<id>` escaped as `\x2d`, so splitting on `-` is safe.
fn app_id_candidates(unit: &str) -> Vec<String> {
    let Some(rest) = unit.strip_prefix("app-") else { return Vec::new() };
    let (rest, is_scope) = match rest.strip_suffix(".scope") {
        Some(r) => (r, true),
        None => (rest.strip_suffix(".service").unwrap_or(rest), false),
    };
    let rest = rest.split('@').next().unwrap_or(rest);

    let segments: Vec<&str> = rest.split('-').collect();
    let mut tails = vec![segments.as_slice()];
    if is_scope && segments.len() > 1 {
        tails.push(&segments[..segments.len() - 1]);
    }

    let mut out = Vec::new();
    for tail in tails {
        for start in 0..tail.len() {
            out.push(tail[start..].join("-").replace("\\x2d", "-"));
        }
    }
    out
}

fn data_dirs() -> Vec<PathBuf> {
    let home = env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    let mut dirs = vec![
        env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".local/share")),
    ];
    let system = env::var("XDG_DATA_DIRS").unwrap_or_else(|_| "/usr/local/share:/usr/share".into());
    dirs.extend(system.split(':').filter(|d| !d.is_empty()).map(PathBuf::from));
    dirs
}

fn find_desktop(id: &str) -> Option<PathBuf> {
    let file = format!("{id}.desktop");
    let home = env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    data_dirs()
        .into_iter()
        .map(|d| d.join("applications"))
        .chain([home.join(".config/autostart"), PathBuf::from("/etc/xdg/autostart")])
        .map(|d| d.join(&file))
        .find(|p| p.is_file())
}

/// Reverse-DNS desktop ids (`com.mitchellh.ghostty.desktop`) whose last
/// component matches one dash-separated piece of the unit name (`ghostty`).
fn find_desktop_by_suffix(candidates: &[String]) -> Option<PathBuf> {
    let pieces: Vec<String> = candidates
        .iter()
        .flat_map(|c| c.split('-'))
        .filter(|p| p.len() > 2 && !p.chars().all(|c| c.is_ascii_digit()))
        .map(str::to_lowercase)
        .collect();
    data_dirs()
        .into_iter()
        .filter_map(|d| fs::read_dir(d.join("applications")).ok())
        .flat_map(|entries| entries.flatten())
        .map(|e| e.path())
        .find(|path| {
            path.file_stem()
                .and_then(|s| s.to_str())
                .and_then(|stem| stem.rsplit('.').next())
                .is_some_and(|last| pieces.contains(&last.to_lowercase()))
        })
}

/// (Name, Icon) from the `[Desktop Entry]` group, unlocalized.
fn parse_desktop(path: &Path) -> (Option<String>, Option<String>) {
    let Ok(text) = fs::read_to_string(path) else { return (None, None) };
    let (mut name, mut icon) = (None, None);
    let mut in_entry = false;
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_entry = line == "[Desktop Entry]";
        } else if in_entry {
            if let Some(v) = line.strip_prefix("Name=") {
                name.get_or_insert_with(|| v.to_string());
            } else if let Some(v) = line.strip_prefix("Icon=") {
                icon.get_or_insert_with(|| v.to_string());
            }
        }
    }
    (name, icon)
}

pub fn icon_data_uri(icon: &str) -> Option<String> {
    let path = if Path::new(icon).is_absolute() {
        PathBuf::from(icon)
    } else {
        freedesktop_icons::lookup(icon).with_size(48).with_cache().find()?
    };
    let mime = match path.extension()?.to_str()? {
        "svg" => "image/svg+xml",
        "png" => "image/png",
        _ => return None,
    };
    let bytes = fs::read(&path).ok()?;
    Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidates_for_autostart_service() {
        let c = app_id_candidates("app-arch\\x2dupdate\\x2dtray@autostart.service");
        assert_eq!(c, ["arch-update-tray"]);
    }

    #[test]
    fn candidates_for_launched_scope() {
        let c = app_id_candidates("app-niri-firefox-1234.scope");
        assert!(c.contains(&"firefox".to_string()));
        assert!(c.contains(&"niri-firefox".to_string()));
    }

    #[test]
    fn key_ignores_launcher_and_random_suffix() {
        assert_eq!(fallback_key("app-niri-firefox-1234.scope").as_deref(), Some("firefox"));
        assert_eq!(fallback_key("app-gnome-Firefox-99.scope").as_deref(), Some("firefox"));
        assert_eq!(fallback_key("app-firefox-1a2b3c.scope").as_deref(), Some("firefox"));
        assert_eq!(fallback_key("app-gnome-org.mozilla.firefox-5.scope").as_deref(), Some("org.mozilla.firefox"));
        assert_eq!(fallback_key("app-arch\\x2dupdate\\x2dtray@autostart.service").as_deref(), Some("arch-update-tray"));
        assert_eq!(fallback_key("app-niri-firefox@abc.service").as_deref(), Some("firefox"));
        assert_eq!(fallback_key("docker.service"), None);
    }

    #[test]
    fn scopes_of_one_launch_are_one_app() {
        assert_eq!(launch_id("app-gnome-google\\x2dchrome-697193.scope"), Some("697193"));
        assert!(same_launch("app-gnome-google\\x2dchrome-697193.scope", "app-com.google.Chrome-697193.scope"));
        assert!(!same_launch("app-com.google.Chrome-697193.scope", "app-com.google.Chrome-697193.scope"));
        assert!(!same_launch("app-gnome-firefox-1.scope", "app-gnome-chromium-2.scope"));
        assert_eq!(launch_id("app-firefox@autostart.service"), None);
        assert_eq!(launch_id("docker.service"), None);
    }

    #[test]
    fn same_app_across_launches() {
        let same = |a, b| same_unit_by(a, b, fallback_key);
        assert!(same("app-niri-firefox-1234.scope", "app-gnome-firefox-99.scope"));
        assert!(same("app-niri-firefox-1234.scope", "app-niri-firefox-1234.scope"));
        assert!(same("app-firefox@autostart.service", "app-niri-firefox-7.scope"));
        assert!(!same("app-niri-firefox-1234.scope", "app-niri-chromium-1234.scope"));
        assert!(same("foo.service", "foo.service"));
        assert!(!same("foo.service", "bar.service"));
        assert!(!same("foo.service", "app-niri-foo-1.scope"));
    }

    #[test]
    fn fallback_drops_launcher_and_random_suffix() {
        assert_eq!(fallback_name("app-niri-noctalia-950.scope").as_deref(), Some("noctalia"));
    }
}
