mod backup;

use tauri_plugin_sql::{Migration, MigrationKind};

const DB_URL: &str = "sqlite:timecanvas.db";

fn migrations() -> Vec<Migration> {
    vec![Migration {
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
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            backup::prune_backups,
            backup::detect_onedrive_dir,
            backup::ensure_dir,
            backup::write_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
