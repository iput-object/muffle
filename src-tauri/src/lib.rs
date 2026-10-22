mod apps;
mod cli;
mod commands;
mod groups;
mod metrics;
mod protect;
mod startup;
mod store;
mod systemd;
mod tray;

use std::sync::Mutex;

use tauri::Manager;

fn is_hidden_startup() -> bool {
    std::env::args().any(|arg| arg == "--hidden")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // `muffle off heavy` and friends exit here, before any window or tray.
    cli::dispatch();

    let is_hidden_startup = is_hidden_startup();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_main(app);
        }))
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(["--hidden"])
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(move |app| {
            let buses = tauri::async_runtime::block_on(systemd::Buses::connect())?;
            app.manage(commands::AppState {
                buses,
                sampler: Mutex::new(metrics::Sampler::new()),
                apps: Mutex::new(apps::AppCache::default()),
                tray_key: Mutex::new(String::new()),
            });

            let handle = app.handle().clone();
            app.handle().run_on_main_thread(move || {
                if let Err(e) = tray::create(&handle) {
                    eprintln!("tray init failed: {e}");
                }

                if !is_hidden_startup {
                    tray::show_main(&handle);
                }
            })?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::snapshot,
            commands::stop_unit,
            commands::start_unit,
            commands::pause_unit,
            commands::resume_unit,
            commands::save_group,
            commands::delete_group,
            commands::add_to_group,
            commands::muffle_group,
            commands::restore_group,
            commands::list_startup,
            commands::set_startup,
            commands::get_settings,
            commands::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
