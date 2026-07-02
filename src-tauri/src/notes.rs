use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};

const MAX_DEPTH: usize = 10;
const MAX_SEARCH_RESULTS: usize = 200;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteNode {
    pub name: String,
    /// ルートからの相対パス（区切りは "/"）
    pub path: String,
    pub kind: String, // "dir" | "file"
    pub children: Vec<NoteNode>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSearchHit {
    pub path: String,
    pub line: usize,
    pub snippet: String,
}

/// 相対パスがルートの外に出ないことを検証して絶対パスへ解決する。
/// `..`・絶対パス・ドライブ指定を拒否する。
fn resolve(root: &str, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() {
        return Err("絶対パスは指定できません".into());
    }
    for component in rel_path.components() {
        match component {
            Component::Normal(_) | Component::CurDir => {}
            _ => return Err(format!("不正なパスです: {rel}")),
        }
    }
    Ok(Path::new(root).join(rel_path))
}

fn build_tree(dir: &Path, rel_prefix: &str, depth: usize) -> std::io::Result<Vec<NoteNode>> {
    if depth > MAX_DEPTH {
        return Ok(Vec::new());
    }
    let mut dirs: Vec<NoteNode> = Vec::new();
    let mut files: Vec<NoteNode> = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let rel = if rel_prefix.is_empty() {
            name.clone()
        } else {
            format!("{rel_prefix}/{name}")
        };
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            let children = build_tree(&entry.path(), &rel, depth + 1)?;
            dirs.push(NoteNode {
                name,
                path: rel,
                kind: "dir".into(),
                children,
            });
        } else if name.to_lowercase().ends_with(".md") {
            files.push(NoteNode {
                name,
                path: rel,
                kind: "file".into(),
                children: Vec::new(),
            });
        }
    }
    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    dirs.extend(files);
    Ok(dirs)
}

/// ノートルート直下のフォルダ・Markdown ファイルのツリーを返す
#[tauri::command]
pub fn list_note_tree(root: String) -> Result<Vec<NoteNode>, String> {
    fs::create_dir_all(&root).map_err(|e| format!("ノートフォルダの作成に失敗: {e}"))?;
    build_tree(Path::new(&root), "", 0).map_err(|e| format!("ツリーの取得に失敗: {e}"))
}

#[tauri::command]
pub fn read_note(root: String, rel: String) -> Result<String, String> {
    let path = resolve(&root, &rel)?;
    fs::read_to_string(&path).map_err(|e| format!("ノートの読み込みに失敗: {e}"))
}

#[tauri::command]
pub fn write_note(root: String, rel: String, content: String) -> Result<(), String> {
    let path = resolve(&root, &rel)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| format!("ノートの保存に失敗: {e}"))
}

#[tauri::command]
pub fn create_note_dir(root: String, rel: String) -> Result<(), String> {
    let path = resolve(&root, &rel)?;
    fs::create_dir_all(&path).map_err(|e| format!("フォルダの作成に失敗: {e}"))
}

#[tauri::command]
pub fn rename_note_path(root: String, from: String, to: String) -> Result<(), String> {
    let from_path = resolve(&root, &from)?;
    let to_path = resolve(&root, &to)?;
    if to_path.exists() {
        return Err("同名のファイル・フォルダが既に存在します".into());
    }
    if let Some(parent) = to_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&from_path, &to_path).map_err(|e| format!("名前の変更に失敗: {e}"))
}

#[tauri::command]
pub fn delete_note_path(root: String, rel: String) -> Result<(), String> {
    let path = resolve(&root, &rel)?;
    if path.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| format!("フォルダの削除に失敗: {e}"))
    } else {
        fs::remove_file(&path).map_err(|e| format!("ノートの削除に失敗: {e}"))
    }
}

fn search_dir(
    dir: &Path,
    rel_prefix: &str,
    keyword_lower: &str,
    hits: &mut Vec<NoteSearchHit>,
    depth: usize,
) -> std::io::Result<()> {
    if depth > MAX_DEPTH || hits.len() >= MAX_SEARCH_RESULTS {
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        if hits.len() >= MAX_SEARCH_RESULTS {
            return Ok(());
        }
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let rel = if rel_prefix.is_empty() {
            name.clone()
        } else {
            format!("{rel_prefix}/{name}")
        };
        if entry.file_type()?.is_dir() {
            search_dir(&entry.path(), &rel, keyword_lower, hits, depth + 1)?;
        } else if name.to_lowercase().ends_with(".md") {
            let Ok(content) = fs::read_to_string(entry.path()) else {
                continue;
            };
            for (index, line) in content.lines().enumerate() {
                if line.to_lowercase().contains(keyword_lower) {
                    hits.push(NoteSearchHit {
                        path: rel.clone(),
                        line: index + 1,
                        snippet: line.chars().take(120).collect(),
                    });
                    if hits.len() >= MAX_SEARCH_RESULTS {
                        return Ok(());
                    }
                }
            }
        }
    }
    Ok(())
}

/// ノート全文からキーワードを含む行を検索する（大文字小文字を区別しない）
#[tauri::command]
pub fn search_notes(root: String, keyword: String) -> Result<Vec<NoteSearchHit>, String> {
    let keyword = keyword.trim().to_lowercase();
    if keyword.is_empty() {
        return Ok(Vec::new());
    }
    let mut hits = Vec::new();
    search_dir(Path::new(&root), "", &keyword, &mut hits, 0).map_err(|e| e.to_string())?;
    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tc-notes-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn resolve_rejects_parent_traversal() {
        assert!(resolve("/tmp/root", "../etc/passwd").is_err());
        assert!(resolve("/tmp/root", "a/../../b").is_err());
        assert!(resolve("/tmp/root", "/abs/path").is_err());
        assert!(resolve("/tmp/root", "folder/note.md").is_ok());
    }

    #[test]
    fn tree_lists_dirs_first_and_md_only() {
        let root = temp_root("tree");
        fs::create_dir_all(root.join("zdir")).unwrap();
        fs::write(root.join("a-note.md"), "hello").unwrap();
        fs::write(root.join("ignore.txt"), "x").unwrap();
        fs::write(root.join("zdir/sub.md"), "sub").unwrap();

        let tree = list_note_tree(root.to_string_lossy().into_owned()).unwrap();
        assert_eq!(tree.len(), 2);
        assert_eq!(tree[0].kind, "dir");
        assert_eq!(tree[0].name, "zdir");
        assert_eq!(tree[0].children[0].path, "zdir/sub.md");
        assert_eq!(tree[1].name, "a-note.md");
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn search_finds_lines_case_insensitively() {
        let root = temp_root("search");
        fs::write(
            root.join("memo.md"),
            "first line\n経費精算のやり方\nAPI Design",
        )
        .unwrap();
        let hits = search_notes(root.to_string_lossy().into_owned(), "api".into()).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].line, 3);
        let hits = search_notes(root.to_string_lossy().into_owned(), "経費".into()).unwrap();
        assert_eq!(hits.len(), 1);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn write_and_rename_roundtrip() {
        let root = temp_root("write");
        let root_s = root.to_string_lossy().into_owned();
        write_note(root_s.clone(), "dir/new.md".into(), "content".into()).unwrap();
        assert_eq!(
            read_note(root_s.clone(), "dir/new.md".into()).unwrap(),
            "content"
        );
        rename_note_path(root_s.clone(), "dir/new.md".into(), "dir/renamed.md".into()).unwrap();
        assert!(read_note(root_s.clone(), "dir/renamed.md".into()).is_ok());
        delete_note_path(root_s.clone(), "dir/renamed.md".into()).unwrap();
        assert!(read_note(root_s, "dir/renamed.md".into()).is_err());
        fs::remove_dir_all(&root).unwrap();
    }
}
