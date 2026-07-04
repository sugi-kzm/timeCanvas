mod backup;
mod notes;

use tauri_plugin_sql::{Migration, MigrationKind};

const DB_URL: &str = "sqlite:timecanvas.db";

#[cfg(target_os = "linux")]
fn set_env_default(key: &str, value: &str) {
    if std::env::var_os(key).is_none() {
        std::env::set_var(key, value);
    }
}

#[cfg(target_os = "linux")]
fn is_wsl() -> bool {
    std::env::var_os("WSL_DISTRO_NAME").is_some()
        || std::env::var_os("WSL_INTEROP").is_some()
        || std::fs::read_to_string("/proc/sys/kernel/osrelease")
            .map(|release| release.to_ascii_lowercase().contains("microsoft"))
            .unwrap_or(false)
}

#[cfg(target_os = "linux")]
fn apply_linux_webkit_workarounds() {
    // 検証用: TIMECANVAS_WEBKIT_ENV=none で既定のワークアラウンドを全て無効化できる
    if std::env::var("TIMECANVAS_WEBKIT_ENV").as_deref() == Ok("none") {
        return;
    }
    if is_wsl() {
        // WSLg can expose WebKitGTK without a usable DRM/DMABUF path, leaving a blank window.
        set_env_default("GDK_BACKEND", "x11");
        set_env_default("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        set_env_default("WEBKIT_DMABUF_RENDERER_DISABLE_GBM", "1");
        set_env_default("WEBKIT_DMABUF_RENDERER_FORCE_SHM", "1");
        set_env_default("WEBKIT_WEBGL_DISABLE_GBM", "1");
        set_env_default("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        set_env_default("WEBKIT_SKIA_ENABLE_CPU_RENDERING", "1");
        set_env_default("WEBKIT_SKIA_GPU_PAINTING_THREADS", "0");
        set_env_default("LIBGL_ALWAYS_SOFTWARE", "1");
        set_env_default("GALLIUM_DRIVER", "llvmpipe");
    }
}

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: "
            CREATE TABLE IF NOT EXISTS categories (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                color       TEXT NOT NULL,
                archived    INTEGER NOT NULL DEFAULT 0,
                sort_order  INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS time_entries (
                id          TEXT PRIMARY KEY,
                title       TEXT NOT NULL,
                category_id TEXT REFERENCES categories(id),
                start_at    TEXT NOT NULL,
                end_at      TEXT NOT NULL,
                memo        TEXT NOT NULL DEFAULT '',
                task_id     TEXT,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_entries_start ON time_entries(start_at);
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_tasks",
            sql: "
            CREATE TABLE IF NOT EXISTS tasks (
                id               TEXT PRIMARY KEY,
                title            TEXT NOT NULL,
                memo             TEXT NOT NULL DEFAULT '',
                category_id      TEXT REFERENCES categories(id),
                estimate_minutes INTEGER,
                status           TEXT NOT NULL DEFAULT 'open',
                due_date         TEXT,
                sort_order       INTEGER NOT NULL DEFAULT 0,
                created_at       TEXT NOT NULL,
                updated_at       TEXT NOT NULL,
                completed_at     TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
            CREATE INDEX IF NOT EXISTS idx_entries_task ON time_entries(task_id);
        ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_task_hierarchy",
            sql: "
            ALTER TABLE tasks ADD COLUMN parent_id TEXT REFERENCES tasks(id);
            CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
        ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_task_status_and_dates",
            sql: "
            UPDATE tasks SET status = 'todo' WHERE status = 'open';
            ALTER TABLE tasks ADD COLUMN start_date TEXT;
        ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_ticket_groups",
            sql: "
            CREATE TABLE IF NOT EXISTS ticket_groups (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                sort_order  INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT NOT NULL
            );
            ALTER TABLE tasks ADD COLUMN group_id TEXT REFERENCES ticket_groups(id);
            CREATE INDEX IF NOT EXISTS idx_tasks_group ON tasks(group_id);
        ",
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    apply_linux_webkit_workarounds();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .setup(|app| {
            use tauri::Manager;
            // DB 接続が開かれる前に、復元待ちのバックアップがあれば差し替える
            let dir = app.path().app_config_dir()?;
            match backup::apply_pending_restore(&dir) {
                Ok(true) => eprintln!("TimeCanvas: バックアップからの復元を適用しました"),
                Ok(false) => {}
                Err(e) => eprintln!("TimeCanvas: 復元の適用に失敗しました: {e}"),
            }
            // WSLg 等でウィンドウが画面外・非表示のまま出てこない事象への防御。
            // 表示・最小化解除・中央配置・フォーカスを明示的に要求する
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.center();
                let _ = window.set_focus();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            backup::prune_backups,
            backup::detect_onedrive_dir,
            backup::ensure_dir,
            backup::write_text_file,
            backup::stage_restore,
            notes::list_note_tree,
            notes::read_note,
            notes::write_note,
            notes::create_note_dir,
            notes::rename_note_path,
            notes::delete_note_path,
            notes::search_notes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
