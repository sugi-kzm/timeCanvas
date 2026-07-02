use std::fs;
use std::path::{Path, PathBuf};

const BACKUP_PREFIX: &str = "timecanvas-backup-";
const BACKUP_SUFFIX: &str = ".db";

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
}
