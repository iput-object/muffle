//! Talks to systemd over D-Bus, on both the system bus (system services) and
//! the session bus (user services, autostart apps, launched app scopes).

use serde::{Deserialize, Serialize};
use zbus::{Connection, OwnedObjectPath, proxy};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Bus {
    System,
    Session,
}

impl Bus {
    pub fn as_str(self) -> &'static str {
        match self {
            Bus::System => "system",
            Bus::Session => "session",
        }
    }
}

type UnitRow = (
    String,          // name
    String,          // description
    String,          // load state
    String,          // active state
    String,          // sub state
    String,          // following
    OwnedObjectPath, // unit path
    u32,             // job id
    String,          // job type
    OwnedObjectPath, // job path
);

type Change = (String, String, String);

#[proxy(
    interface = "org.freedesktop.systemd1.Manager",
    default_service = "org.freedesktop.systemd1",
    default_path = "/org/freedesktop/systemd1"
)]
trait Manager {
    fn list_units(&self) -> zbus::Result<Vec<UnitRow>>;

    fn list_unit_files_by_patterns(
        &self,
        states: &[&str],
        patterns: &[&str],
    ) -> zbus::Result<Vec<(String, String)>>;

    #[zbus(allow_interactive_auth)]
    fn start_unit(&self, name: &str, mode: &str) -> zbus::Result<OwnedObjectPath>;

    #[zbus(allow_interactive_auth)]
    fn stop_unit(&self, name: &str, mode: &str) -> zbus::Result<OwnedObjectPath>;

    #[zbus(allow_interactive_auth)]
    fn kill_unit(&self, name: &str, whom: &str, signal: i32) -> zbus::Result<()>;

    #[zbus(allow_interactive_auth)]
    fn freeze_unit(&self, name: &str) -> zbus::Result<()>;

    #[zbus(allow_interactive_auth)]
    fn thaw_unit(&self, name: &str) -> zbus::Result<()>;

    #[zbus(allow_interactive_auth)]
    fn enable_unit_files(
        &self,
        files: &[&str],
        runtime: bool,
        force: bool,
    ) -> zbus::Result<(bool, Vec<Change>)>;

    #[zbus(allow_interactive_auth)]
    fn disable_unit_files(&self, files: &[&str], runtime: bool) -> zbus::Result<Vec<Change>>;

    #[zbus(allow_interactive_auth)]
    fn reload(&self) -> zbus::Result<()>;
}

/// A loaded unit as systemd reports it.
pub struct RawUnit {
    pub bus: Bus,
    pub name: String,
    pub description: String,
    pub active: bool,
    /// "running", "frozen", "exited", …
    pub sub: String,
}

impl RawUnit {
    /// Holds processes right now: active and not a finished oneshot.
    pub fn is_running(&self) -> bool {
        self.active && self.sub != "exited"
    }

    /// Only holds other units (the user manager, the session, PID 1).
    /// Listing it would count everything inside twice.
    pub fn is_container(&self) -> bool {
        self.name == "init.scope" || self.name.starts_with("user@") || self.name.starts_with("session-")
    }
}

/// One connection per bus, opened once at startup.
pub struct Buses {
    system: Connection,
    session: Connection,
}

fn is_process_unit(name: &str) -> bool {
    name.ends_with(".service") || name.ends_with(".scope")
}

impl Buses {
    pub async fn connect() -> zbus::Result<Self> {
        Ok(Self {
            system: Connection::system().await?,
            session: Connection::session().await?,
        })
    }

    async fn manager(&self, bus: Bus) -> zbus::Result<ManagerProxy<'_>> {
        let conn = match bus {
            Bus::System => &self.system,
            Bus::Session => &self.session,
        };
        ManagerProxy::new(conn).await
    }

    /// Every loaded service and scope on one bus, running or not.
    pub async fn units(&self, bus: Bus) -> zbus::Result<Vec<RawUnit>> {
        let rows = self.manager(bus).await?.list_units().await?;
        Ok(rows
            .into_iter()
            .filter(|row| is_process_unit(&row.0))
            .map(|(name, description, _, active, sub, ..)| RawUnit {
                bus,
                name,
                description,
                // Frozen units report "active" too.
                active: active == "active",
                sub,
            })
            .collect())
    }

    /// Running (or frozen) services and scopes on both buses.
    pub async fn running(&self) -> zbus::Result<Vec<RawUnit>> {
        let mut out = self.units(Bus::Session).await?;
        out.extend(self.units(Bus::System).await?);
        out.retain(RawUnit::is_running);
        Ok(out)
    }

    /// Service unit files enabled to start at boot (system) or login (session).
    pub async fn enabled_services(&self, bus: Bus) -> zbus::Result<Vec<String>> {
        let files = self
            .manager(bus)
            .await?
            .list_unit_files_by_patterns(&["enabled"], &["*.service"])
            .await?;
        Ok(files
            .into_iter()
            .filter_map(|(path, _)| path.rsplit('/').next().map(str::to_string))
            .filter(|name| !name.contains('@'))
            .collect())
    }

    pub async fn start(&self, bus: Bus, name: &str) -> zbus::Result<()> {
        self.manager(bus).await?.start_unit(name, "replace").await?;
        Ok(())
    }

    pub async fn stop(&self, bus: Bus, name: &str) -> zbus::Result<()> {
        self.manager(bus).await?.stop_unit(name, "replace").await?;
        Ok(())
    }

    /// SIGKILL every process in the unit. For a service a stop job is queued
    /// first, so `Restart=` doesn't bring it straight back.
    pub async fn kill(&self, bus: Bus, name: &str) -> zbus::Result<()> {
        const SIGKILL: i32 = 9;
        let manager = self.manager(bus).await?;
        if name.ends_with(".scope") {
            return manager.kill_unit(name, "all", SIGKILL).await;
        }
        manager.stop_unit(name, "replace").await?;
        // The stop job finishes the job anyway; the kill only makes it instant,
        // and fails harmlessly if the service already exited.
        let _ = manager.kill_unit(name, "all", SIGKILL).await;
        Ok(())
    }

    pub async fn freeze(&self, bus: Bus, name: &str) -> zbus::Result<()> {
        self.manager(bus).await?.freeze_unit(name).await
    }

    pub async fn thaw(&self, bus: Bus, name: &str) -> zbus::Result<()> {
        self.manager(bus).await?.thaw_unit(name).await
    }

    pub async fn set_enabled(&self, bus: Bus, name: &str, enabled: bool) -> zbus::Result<()> {
        let manager = self.manager(bus).await?;
        if enabled {
            manager.enable_unit_files(&[name], false, false).await?;
        } else {
            manager.disable_unit_files(&[name], false).await?;
        }
        manager.reload().await
    }
}
