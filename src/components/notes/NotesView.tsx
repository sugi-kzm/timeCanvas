import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../store/appStore";
import {
  createNoteDir,
  deleteNotePath,
  getNotesRoot,
  listNoteTree,
  readNote,
  renameNotePath,
  searchNotes,
  setNotesRoot,
  writeNote,
  type NoteNode,
  type NoteSearchHit,
} from "../../db/notesService";
import { IconChevronRight, IconClose, IconDoc, IconFolder, IconPlus } from "../icons";

const AUTOSAVE_DELAY_MS = 800;

/** インライン HTML をエスケープしてから Markdown として描画する（XSS 対策） */
function renderMarkdown(content: string): string {
  const escaped = content
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return marked.parse(escaped, { async: false });
}

/** "folder/note.md" → 表示名 "note" */
function displayName(name: string): string {
  return name.replace(/\.md$/i, "");
}

export function NotesView() {
  const setStatus = useAppStore((s) => s.setStatus);

  const [root, setRoot] = useState<string | null>(null);
  const [tree, setTree] = useState<NoteNode[]>([]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [hits, setHits] = useState<NoteSearchHit[]>([]);

  const contentRef = useRef(content);
  contentRef.current = content;
  const selectedRef = useRef(selectedPath);
  selectedRef.current = selectedPath;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const reloadTree = useCallback(
    async (rootDir: string) => {
      try {
        setTree(await listNoteTree(rootDir));
      } catch (e) {
        setStatus(`ノート一覧の取得に失敗しました: ${String(e)}`);
      }
    },
    [setStatus],
  );

  useEffect(() => {
    void (async () => {
      try {
        const dir = await getNotesRoot();
        setRoot(dir);
        await reloadTree(dir);
      } catch (e) {
        setStatus(`ノートの初期化に失敗しました: ${String(e)}`);
      }
    })();
  }, [reloadTree, setStatus]);

  const saveCurrent = useCallback(async () => {
    if (root === null || selectedRef.current === null || !dirtyRef.current) return;
    try {
      await writeNote(root, selectedRef.current, contentRef.current);
      setDirty(false);
    } catch (e) {
      setStatus(`ノートの保存に失敗しました: ${String(e)}`);
    }
  }, [root, setStatus]);

  // 自動保存（入力が止まって 0.8 秒後）
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => void saveCurrent(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [content, dirty, saveCurrent]);

  // アンマウント時に未保存分を書き出す
  useEffect(() => {
    return () => {
      void saveCurrent();
    };
  }, [saveCurrent]);

  const openNote = async (path: string) => {
    if (root === null) return;
    await saveCurrent();
    try {
      const text = await readNote(root, path);
      setSelectedPath(path);
      setContent(text);
      setDirty(false);
      setPreviewMode(false);
    } catch (e) {
      setStatus(`ノートを開けませんでした: ${String(e)}`);
    }
  };

  const selectedDir = useMemo(() => {
    if (selectedPath === null) return "";
    const idx = selectedPath.lastIndexOf("/");
    return idx === -1 ? "" : selectedPath.slice(0, idx);
  }, [selectedPath]);

  const createNote = async () => {
    if (root === null) return;
    const name = window.prompt("ノート名を入力してください（例: 経費精算のやり方）");
    if (name === null || name.trim() === "") return;
    const safe = name.trim().replaceAll("/", "-");
    const rel = selectedDir === "" ? `${safe}.md` : `${selectedDir}/${safe}.md`;
    try {
      await writeNote(root, rel, `# ${safe}\n\n`);
      await reloadTree(root);
      await openNote(rel);
    } catch (e) {
      setStatus(`ノートの作成に失敗しました: ${String(e)}`);
    }
  };

  const createFolder = async () => {
    if (root === null) return;
    const name = window.prompt("フォルダ名を入力してください");
    if (name === null || name.trim() === "") return;
    const safe = name.trim().replaceAll("/", "-");
    const rel = selectedDir === "" ? safe : `${selectedDir}/${safe}`;
    try {
      await createNoteDir(root, rel);
      await reloadTree(root);
      setExpanded((prev) => new Set([...prev, rel]));
    } catch (e) {
      setStatus(`フォルダの作成に失敗しました: ${String(e)}`);
    }
  };

  const renameSelected = async () => {
    if (root === null || selectedPath === null) return;
    const current = selectedPath.split("/").pop() ?? "";
    const name = window.prompt("新しい名前", displayName(current));
    if (name === null || name.trim() === "") return;
    const safe = name.trim().replaceAll("/", "-");
    const to = selectedDir === "" ? `${safe}.md` : `${selectedDir}/${safe}.md`;
    if (to === selectedPath) return;
    try {
      await saveCurrent();
      await renameNotePath(root, selectedPath, to);
      await reloadTree(root);
      setSelectedPath(to);
    } catch (e) {
      setStatus(`名前の変更に失敗しました: ${String(e)}`);
    }
  };

  const deleteSelected = async () => {
    if (root === null || selectedPath === null) return;
    if (!window.confirm(`「${displayName(selectedPath)}」を削除しますか？`)) return;
    try {
      await deleteNotePath(root, selectedPath);
      setSelectedPath(null);
      setContent("");
      setDirty(false);
      await reloadTree(root);
    } catch (e) {
      setStatus(`削除に失敗しました: ${String(e)}`);
    }
  };

  const changeRoot = async () => {
    const dir = await open({ directory: true, title: "ノートの保存先フォルダを選択" });
    if (typeof dir !== "string") return;
    await saveCurrent();
    await setNotesRoot(dir);
    setRoot(dir);
    setSelectedPath(null);
    setContent("");
    await reloadTree(dir);
  };

  // 全文検索（デバウンス）
  useEffect(() => {
    if (root === null || keyword.trim() === "") {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      searchNotes(root, keyword)
        .then(setHits)
        .catch((e) => setStatus(`検索に失敗しました: ${String(e)}`));
    }, 250);
    return () => clearTimeout(timer);
  }, [keyword, root, setStatus]);

  const toggleExpand = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const renderNodes = (nodes: NoteNode[], depth: number) => (
    <ul className="note-tree" style={{ paddingLeft: depth === 0 ? 0 : 14 }}>
      {nodes.map((node) => (
        <li key={node.path}>
          {node.kind === "dir" ? (
            <>
              <button
                type="button"
                className="note-tree-row dir"
                onClick={() => toggleExpand(node.path)}
              >
                <span className={`tree-caret ${expanded.has(node.path) ? "open" : ""}`}>
                  <IconChevronRight size={12} />
                </span>
                <span className="note-tree-icon">
                  <IconFolder size={14} />
                </span>
                <span className="note-tree-name">{node.name}</span>
              </button>
              {expanded.has(node.path) && renderNodes(node.children, depth + 1)}
            </>
          ) : (
            <button
              type="button"
              className={`note-tree-row file ${node.path === selectedPath ? "active" : ""}`}
              onClick={() => void openNote(node.path)}
            >
              <span className="note-tree-icon">
                <IconDoc size={14} />
              </span>
              <span className="note-tree-name">{displayName(node.name)}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="notes-view">
      <aside className="notes-sidebar">
        <div className="notes-section-label">
          <span>ノート</span>
          <span className="spacer" />
          <button
            type="button"
            className="ghost-icon-btn"
            title="新しいノート"
            aria-label="新しいノート"
            onClick={() => void createNote()}
          >
            <IconPlus size={14} />
          </button>
          <button
            type="button"
            className="ghost-icon-btn"
            title="新しいフォルダ"
            aria-label="新しいフォルダ"
            onClick={() => void createFolder()}
          >
            <IconFolder size={14} />
          </button>
        </div>
        <input
          type="search"
          className="text-input notes-search"
          placeholder="ノートを検索"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        {keyword.trim() !== "" ? (
          <ul className="note-hits">
            {hits.length === 0 && <li className="note-hits-empty">見つかりませんでした</li>}
            {hits.map((hit, i) => (
              <li key={`${hit.path}-${hit.line}-${i}`}>
                <button
                  type="button"
                  className="note-hit"
                  onClick={() => {
                    setKeyword("");
                    void openNote(hit.path);
                  }}
                >
                  <span className="note-hit-path">{displayName(hit.path)}</span>
                  <span className="note-hit-snippet">{hit.snippet}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          renderNodes(tree, 0)
        )}
        <div className="notes-root-row" title={root ?? ""}>
          <span className="notes-root-path">{root ?? "..."}</span>
          <button type="button" className="link-btn" onClick={() => void changeRoot()}>
            変更
          </button>
        </div>
      </aside>
      <div className="notes-main">
        {selectedPath === null ? (
          <div className="placeholder-view">
            <p>左のツリーからノートを選ぶか、「+ ノート」で作成してください</p>
          </div>
        ) : (
          <>
            <div className="notes-toolbar">
              <span className="notes-title">{displayName(selectedPath)}</span>
              <span className={`notes-save-state ${dirty ? "dirty" : ""}`}>
                {dirty ? "未保存..." : "保存済み"}
              </span>
              <span className="spacer" />
              <div className="view-switch" role="group" aria-label="編集/プレビュー">
                <button
                  type="button"
                  className={`seg ${previewMode ? "" : "active"}`}
                  onClick={() => setPreviewMode(false)}
                >
                  編集
                </button>
                <button
                  type="button"
                  className={`seg ${previewMode ? "active" : ""}`}
                  onClick={() => {
                    void saveCurrent();
                    setPreviewMode(true);
                  }}
                >
                  プレビュー
                </button>
              </div>
              <button type="button" className="btn" onClick={() => void renameSelected()}>
                名前変更
              </button>
              <button
                type="button"
                className="btn icon-btn danger"
                aria-label="削除"
                title="削除"
                onClick={() => void deleteSelected()}
              >
                <IconClose size={15} />
              </button>
            </div>
            {previewMode ? (
              <div
                className="md-preview"
                // renderMarkdown 内で HTML エスケープ済み
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
              />
            ) : (
              <textarea
                className="notes-editor"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setDirty(true);
                }}
                onBlur={() => void saveCurrent()}
                spellCheck={false}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
