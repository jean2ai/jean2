use crate::audio;

use std::sync::atomic::{AtomicU32, Ordering};

use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Emitter;

static WINDOW_COUNTER: AtomicU32 = AtomicU32::new(1);

#[tauri::command]
fn create_new_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    let window_id = WINDOW_COUNTER.fetch_add(1, Ordering::SeqCst);
    let label = format!("window-{}", window_id);

    tauri::WebviewWindow::builder(
        &app_handle,
        &label,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("Jean2")
    .inner_size(1200.0, 800.0)
    .min_inner_size(800.0, 600.0)
    .center()
    .resizable(true)
    .build()
    .map_err(|e: tauri::Error| e.to_string())?;

    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![create_new_window, audio::play_sound])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            if let Err(e) = audio::init_audio() {
                eprintln!("Failed to initialize audio system: {}", e);
            }

            let open_sidebar = MenuItemBuilder::with_id("open-sidebar", "Open Sidebar")
                .accelerator("CmdOrCtrl+1")
                .build(app)?;
            let open_terminal = MenuItemBuilder::with_id("open-terminal", "Open Terminal")
                .accelerator("CmdOrCtrl+T")
                .build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&SubmenuBuilder::new(app, "Jean2")
                    .about(None)
                    .separator()
                    .quit()
                    .build()?)
                .item(&SubmenuBuilder::new(app, "Edit")
                    .copy()
                    .cut()
                    .paste()
                    .select_all()
                    .build()?)
                .item(&SubmenuBuilder::new(app, "Window")
                    .minimize()
                    .maximize()
                    .fullscreen()
                    .build()?)
                .item(&SubmenuBuilder::new(app, "View")
                    .item(&open_sidebar)
                    .item(&open_terminal)
                    .build()?)
                .build()?;

            app.set_menu(menu)?;

            app.on_menu_event(move |app, event| {
                let id = event.id().as_ref();
                let url = if id.ends_with("open-sidebar") {
                    "jean2://accelerator/open-sidebar"
                } else if id.ends_with("open-terminal") {
                    "jean2://accelerator/open-terminal"
                } else {
                    return;
                };

                let _ = app.emit(url, ());
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
