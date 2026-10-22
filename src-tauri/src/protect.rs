//! Units muffle never stops: the desktop session, audio, networking, and
//! systemd's own plumbing. Stopping any of these breaks the session.
//! Users can add their own patterns in Settings.

pub const BUILT_IN: &[&str] = &[
    "init.scope",
    "session-*",
    "user@*",
    "systemd-*",
    "dbus*",
    "*dbus-broker*",
    "polkit*",
    "niri*",
    "pipewire*",
    "wireplumber*",
    "NetworkManager*",
    "wpa_supplicant*",
    "iwd*",
    "*portal*",
    "at-spi*",
    "sddm*",
    "gdm*",
    "lightdm*",
    "greetd*",
    "ly.service",
    "dconf*",
    "gnome-keyring*",
    "udisks2*",
    "upower*",
    "rtkit*",
    "elogind*",
];

fn matches(pattern: &str, name: &str) -> bool {
    match (pattern.strip_prefix('*'), pattern.strip_suffix('*')) {
        (Some(mid), _) if mid.ends_with('*') => name.contains(&mid[..mid.len() - 1]),
        (Some(suffix), _) => name.ends_with(suffix),
        (_, Some(prefix)) => name.starts_with(prefix),
        _ => name == pattern,
    }
}

/// Built-in patterns, the user's own, and the unit muffle itself runs in.
pub struct Protect {
    extra: Vec<String>,
    own_unit: Option<String>,
}

impl Protect {
    pub fn new(extra: Vec<String>, own_unit: Option<String>) -> Self {
        Self { extra, own_unit }
    }

    pub fn load() -> Self {
        Self::new(crate::store::settings().protected, crate::metrics::own_unit())
    }

    pub fn is_protected(&self, name: &str) -> bool {
        self.own_unit.as_deref() == Some(name)
            || BUILT_IN.iter().any(|p| matches(p, name))
            || self.extra.iter().any(|p| !p.trim().is_empty() && matches(p.trim(), name))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patterns() {
        let p = Protect::new(vec!["noctalia*".into()], Some("app-foo-1.scope".into()));
        assert!(p.is_protected("niri.service"));
        assert!(p.is_protected("xdg-desktop-portal-gtk.service"));
        assert!(p.is_protected("dbus-:1.26-org.a11y.atspi.Registry@0.service"));
        assert!(p.is_protected("app-foo-1.scope"));
        assert!(p.is_protected("noctalia.service"));
        assert!(!p.is_protected("docker.service"));
        assert!(!p.is_protected("lyrics.service"));
    }
}
