//! System tray: one entry per group (muffle or restore it in one click), plus
//! open and quit. Left-click surfaces the window.

use tauri::{
    AppHandle, Manager, Wry,
    menu::{Menu, MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

use crate::commands::{AppState, groups_changed};
use crate::store;

const OPEN_ID: &str = "__open";
const QUIT_ID: &str = "__quit";
const NONE_ID: &str = "__none";
const GROUP_PREFIX: &str = "group:";

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let groups = store::groups().unwrap_or_default();
    let muffled = store::muffled_ids();
    let mut menu = MenuBuilder::new(app);

    if groups.is_empty() {
        let empty = MenuItemBuilder::with_id(NONE_ID, "No groups yet").enabled(false).build(app)?;
        menu = menu.item(&empty);
    } else {
        for group in &groups {
            let text = if muffled.contains(&group.id) {
                format!("Restore {}", group.name)
            } else {
                format!("Muffle {}", group.name)
            };
            let item = MenuItemBuilder::with_id(format!("{GROUP_PREFIX}{}", group.id), text).build(app)?;
            menu = menu.item(&item);
        }
    }

    let open = MenuItemBuilder::with_id(OPEN_ID, "Open muffle").build(app)?;
    let quit = MenuItemBuilder::with_id(QUIT_ID, "Quit muffle").build(app)?;
    menu.separator().item(&open).item(&quit).build()
}

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn on_menu_event(app: &AppHandle, id: &str) {
    match id {
        OPEN_ID => show_main(app),
        QUIT_ID => app.exit(0),
        id => {
            let Some(group_id) = id.strip_prefix(GROUP_PREFIX) else { return };
            // Stopping units can wait on a password prompt: never block the
            // menu's event loop on it.
            let app = app.clone();
            let group_id = group_id.to_string();
            tauri::async_runtime::spawn(async move {
                let state = app.state::<AppState>();
                let result = if store::muffled_ids().contains(&group_id) {
                    crate::groups::restore(&state.buses, &group_id).await
                } else {
                    match store::find_group(&group_id) {
                        Ok(group) => crate::groups::muffle(&state.buses, &group).await,
                        Err(e) => Err(e),
                    }
                };
                if let Err(e) = result {
                    eprintln!("tray: {e}");
                }
                groups_changed(&app);
            });
        }
    }
}

/// Create the tray icon and its menu (called once at startup).
pub fn create(app: &AppHandle) -> tauri::Result<()> {
    // Never register twice: a lingering tray (hot-reload) would otherwise
    // trigger libayatana "already exported" warnings on the
    // StatusNotifierItem D-Bus path.
    if app.tray_by_id("main").is_some() {
        return Ok(());
    }

    let menu = build_menu(app)?;
    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("muffle")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| on_menu_event(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}

/// Rebuild the menu after groups change. Menu edits happen on the main thread.
pub fn rebuild(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(tray) = handle.tray_by_id("main") {
            if let Ok(menu) = build_menu(&handle) {
                let _ = tray.set_menu(Some(menu));
            }
            // set_menu makes libappindicator re-register the item, which can
            // drop the icon. Re-apply it so it survives every rebuild.
            if let Some(icon) = handle.default_window_icon().cloned() {
                let _ = tray.set_icon(Some(icon));
            }
        }
    });
}
