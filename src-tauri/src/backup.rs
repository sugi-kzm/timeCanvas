use std::fs;
use std::path::{Path, PathBuf};

const BACKUP_PREFIX: &str = "timecanvas-backup-";
const BACKUP_SUFFIX: &str = ".db";
const RESTORE_PENDING_FILE: &str = "restore-pending.db";
const DB_FILE: &str = "timecanvas.db";

/// Deletes old backup files in `dir`, keeping the newest `keep` generations.
/// Only files matching the `timecanvas-backup-*.db` pattern are touched.
#[tauri::command]
pub fn prune_backups(dir: String, keep: usize) -> Result<u32, String> {
    let path = Path::new(&dir);
    if !path.is_dir() {
        return Err(format!("バックアップフォルダが見つかりません: {dir}"));
    }
    let mut backups = list_backup_files(path).map_err(|e| e.to_string())?;
    // Timestamped names sort chronologically; newest last.
    backups.sort();
    if backups.len() <= keep {
        return Ok(0);
    }
    let excess = backups.len() - keep;
    let mut removed = 0u32;
    for file in backups.into_iter().take(excess) {
        match fs::remove_file(&file) {
            Ok(()) => removed += 1,
            Err(e) => return Err(format!("古いバックアップの削除に失敗: {e}")),
        }
    }
    Ok(removed)
}

/// Returns the user's OneDrive folder if the standard environment variable is set.
#[tauri::command]
pub fn detect_onedrive_dir() -> Option<String> {
    std::env::var("OneDrive")
        .or_else(|_| std::env::var("OneDriveConsumer"))
        .ok()
        .filter(|v| !v.is_empty() && Path::new(v).is_dir())
}

/// Creates the directory (and parents) if it does not exist.
#[tauri::command]
pub fn ensure_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("フォルダの作成に失敗: {e}"))
}

/// 選択されたバックアップを「復元待ち」として配置する。
/// 開いている DB を直接上書きすると破損するため、次回起動時の
/// `apply_pending_restore` で差し替える 2 段階方式にしている。
#[tauri::command]
pub fn stage_restore(app: tauri::AppHandle, src: String) -> Result<(), String> {
    use tauri::Manager;
    let src_path = Path::new(&src);
    if !src_path.is_file() {
        return Err(format!("バックアップファイルが見つかりません: {src}"));
    }
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::copy(src_path, dir.join(RESTORE_PENDING_FILE))
        .map_err(|e| format!("バックアップのコピーに失敗: {e}"))?;
    Ok(())
}

/// 起動時（DB 接続前）に呼ばれ、復元待ちファイルがあれば DB を差し替える。
/// 現行 DB は `timecanvas-pre-restore-<unix秒>.db` として同じフォルダに退避する。
pub fn apply_pending_restore(dir: &Path) -> std::io::Result<bool> {
    let pending = dir.join(RESTORE_PENDING_FILE);
    if !pending.is_file() {
        return Ok(false);
    }
    let db = dir.join(DB_FILE);
    if db.exists() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        fs::rename(&db, dir.join(format!("timecanvas-pre-restore-{stamp}.db")))?;
    }
    // WAL / SHM が残っていると復元後の DB と不整合になるため削除する
    let _ = fs::remove_file(dir.join("timecanvas.db-wal"));
    let _ = fs::remove_file(dir.join("timecanvas.db-shm"));
    fs::rename(&pending, &db)?;
    Ok(true)
}

/// Writes UTF-8 text to `path`. Used for JSON/CSV export to a user-chosen file.
#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.exists() {
            return Err(format!(
                "保存先フォルダが存在しません: {}",
                parent.display()
            ));
        }
    }
    fs::write(&path, contents).map_err(|e| format!("ファイルの書き込みに失敗: {e}"))
}

fn list_backup_files(dir: &Path) -> std::io::Result<Vec<PathBuf>> {
    let mut result = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with(BACKUP_PREFIX) && name.ends_with(BACKUP_SUFFIX) {
            result.push(entry.path());
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_backup_files(dir: &Path, names: &[&str]) {
        for name in names {
            fs::write(dir.join(name), b"x").unwrap();
        }
    }

    #[test]
    fn prunes_oldest_backups_beyond_keep_count() {
        let dir = std::env::temp_dir().join(format!("tc-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        make_backup_files(
            &dir,
            &[
                "timecanvas-backup-20260101-000000.db",
                "timecanvas-backup-20260102-000000.db",
                "timecanvas-backup-20260103-000000.db",
                "unrelated.txt",
            ],
        );
        let removed = prune_backups(dir.to_string_lossy().into_owned(), 2).unwrap();
        assert_eq!(removed, 1);
        assert!(!dir.join("timecanvas-backup-20260101-000000.db").exists());
        assert!(dir.join("timecanvas-backup-20260103-000000.db").exists());
        assert!(dir.join("unrelated.txt").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn prune_returns_zero_when_under_limit() {
        let dir = std::env::temp_dir().join(format!("tc-test2-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        make_backup_files(&dir, &["timecanvas-backup-20260101-000000.db"]);
        let removed = prune_backups(dir.to_string_lossy().into_owned(), 30).unwrap();
        assert_eq!(removed, 0);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn prune_errors_on_missing_dir() {
        let result = prune_backups("/nonexistent/tc-backup-dir".into(), 5);
        assert!(result.is_err());
    }

    #[test]
    fn apply_pending_restore_swaps_db_and_keeps_old_copy() {
        let dir = std::env::temp_dir().join(format!("tc-restore-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(DB_FILE), b"current").unwrap();
        fs::write(dir.join("timecanvas.db-wal"), b"wal").unwrap();
        fs::write(dir.join(RESTORE_PENDING_FILE), b"restored").unwrap();

        let applied = apply_pending_restore(&dir).unwrap();

        assert!(applied);
        assert_eq!(fs::read(dir.join(DB_FILE)).unwrap(), b"restored");
        assert!(!dir.join(RESTORE_PENDING_FILE).exists());
        assert!(!dir.join("timecanvas.db-wal").exists());
        let pre_restore_exists = fs::read_dir(&dir).unwrap().any(|e| {
            e.unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with("timecanvas-pre-restore-")
        });
        assert!(pre_restore_exists);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn apply_pending_restore_is_noop_without_pending_file() {
        let dir = std::env::temp_dir().join(format!("tc-restore2-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(DB_FILE), b"current").unwrap();

        let applied = apply_pending_restore(&dir).unwrap();

        assert!(!applied);
        assert_eq!(fs::read(dir.join(DB_FILE)).unwrap(), b"current");
        fs::remove_dir_all(&dir).unwrap();
    }
}
