//! Token Rats taskbar — Tauri 2.x entry point.
//!
//! Wires up:
//!   - tray icon with a menu (Open, Sync now, Quit)
//!   - hidden-by-default popover window that toggles when the tray icon is clicked
//!   - auto-launch plugin (off by default)
//!   - tauri-plugin-store for persisting the auth token from the webview
//!   - tauri-plugin-opener so the webview can open URLs in the default browser
//!   - a single `sync_now` command. v1.2 implementation is a stub; full parser
//!     wiring is deferred to v1.3.

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WindowEvent,
};
use tauri_plugin_autostart::MacosLauncher;

/// Stub for the "Sync now" action. v1.2 returns a friendly message; v1.3 will
/// shell out to (or embed) the parser pipeline from `packages/cli`.
#[tauri::command]
fn sync_now() -> Result<String, String> {
    // TODO(v1.3): invoke the same code path as `token-rats sync`. For v1.2 we
    // return a placeholder so the UI button is wired end-to-end without
    // pulling the parsers into the Rust crate.
    Ok("Sync stub: parser bridge ships in v1.3.".to_string())
}

fn build_tray_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let open = MenuItem::with_id(app, "open", "Open Token Rats", true, None::<&str>)?;
    let sync = MenuItem::with_id(app, "sync", "Sync now", true, None::<&str>)?;
    let dashboard = MenuItem::with_id(app, "dashboard", "Open dashboard…", true, None::<&str>)?;
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    Menu::with_items(app, &[&open, &sync, &dashboard, &separator, &quit])
}

fn toggle_popover(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        match window.is_visible() {
            Ok(true) => {
                let _ = window.hide();
            }
            _ => {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![sync_now])
        .setup(|app| {
            let handle = app.handle().clone();
            let menu = build_tray_menu(&handle)?;

            // Build the tray icon. We try to use the bundled `icon.png`;
            // fall back to the app's default icon on failure.
            let icon = app
                .default_window_icon()
                .cloned()
                .ok_or_else(|| tauri::Error::AssetNotFound("icon".into()))?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "open" => toggle_popover(app),
                    "sync" => {
                        // Surface the command to the webview; UI handles the result.
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("tr://sync", ());
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "dashboard" => {
                        let _ = tauri_plugin_opener::OpenerExt::opener(app).open_url(
                            "https://tokenrats.com/app",
                            None::<&str>,
                        );
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_popover(tray.app_handle());
                    }
                })
                .build(app)?;

            // Hide-on-close instead of quitting: this is a tray app.
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running token-rats taskbar");
}
