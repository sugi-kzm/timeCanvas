import { useCallback, useEffect, useRef, useState } from "react";
import { marked } from "marked";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../store/appStore";
import { confirmDialog } from "../../store/confirmStore";
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
import { IconChevronRight, IconDoc, IconFolder, IconPlus } from "../icons";

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

function dirOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

interface PendingNew {
  kind: "note" | "folder";
  /** 作成先ディレクトリ（ルートは "" ） */
  dir: string;
}

interface RenameState {
  path: string;
  kind: "note" | "folder";
}

interface ContextMenuState {
  path: string;
  kind: "note" | "folder";
  x: number;
  y: number;
}

export function NotesView() {
  const setStatus = useAppStore((s) => s.setStatus);

  const [root, setRoot] = useState<string | null>(null);
  const [tree, setTree] = useState<NoteNode[]>([]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [hits, setHits] = useState<NoteSearchHit[]>([]);
  const [pendingNew, setPendingNew] = useState<PendingNew | null>(null);
  const [renaming, setRenaming] = useState<RenameState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

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

  /** 既存ノートを開く。既定はプレビュー表示（A4） */
  const openNote = async (path: string, opts: { editByDefault?: boolean } = {}) => {
    if (root === null) return;
    await saveCurrent();
    try {
      const text = await readNote(root, path);
      setSelectedPath(path);
      setActivePath(path);
      setContent(text);
      setDirty(false);
      setPreviewMode(!(opts.editByDefault ?? false));
    } catch (e) {
      setStatus(`ノートを開けませんでした: ${String(e)}`);
    }
  };

  // ---------- 新規作成（ツリーに直接インラインで名前入力） ----------

  const beginCreate = (kind: "note" | "folder") => {
    // 直近でフォルダを選んでいればそこに、なければ開いているノートのフォルダに、
    // どちらもなければルートに作成する
    const dir =
      activePath !== null && activePath !== selectedPath
        ? activePath
        : selectedPath !== null
          ? dirOf(selectedPath)
          : "";
    if (dir !== "") setExpanded((prev) => new Set([...prev, dir]));
    setPendingNew({ kind, dir });
  };

  const commitCreate = async (dir: string, kind: "note" | "folder", rawName: string) => {
    setPendingNew(null);
    const name = rawName.trim();
    if (root === null || name === "") return;
    const safe = name.replaceAll("/", "-");
    const rel = dir === "" ? safe : `${dir}/${safe}`;
    try {
      if (kind === "note") {
        const relMd = `${rel}.md`;
        await writeNote(root, relMd, `# ${safe}\n\n`);
        await reloadTree(root);
        await openNote(relMd, { editByDefault: true });
      } else {
        await createNoteDir(root, rel);
        await reloadTree(root);
        setExpanded((prev) => new Set([...prev, rel]));
        setActivePath(rel);
      }
    } catch (e) {
      setStatus(`作成に失敗しました: ${String(e)}`);
    }
  };

  // ---------- 名前変更（選択中の項目を再クリック / コンテキストメニュー） ----------

  const startRename = (path: string, kind: "note" | "folder") => {
    setContextMenu(null);
    setRenaming({ path, kind });
  };

  const commitRename = async (state: RenameState, rawName: string) => {
    setRenaming(null);
    if (root === null) return;
    const name = rawName.trim();
    if (name === "") return;
    const safe = name.replaceAll("/", "-");
    const dir = dirOf(state.path);
    const to = state.kind === "note" ? `${dir === "" ? "" : `${dir}/`}${safe}.md` : `${dir === "" ? "" : `${dir}/`}${safe}`;
    if (to === state.path) return;
    try {
      if (state.kind === "note" && state.path === selectedPath) await saveCurrent();
      await renameNotePath(root, state.path, to);
      await reloadTree(root);
      if (state.path === selectedPath) setSelectedPath(to);
      if (state.path === activePath) setActivePath(to);
    } catch (e) {
      setStatus(`名前の変更に失敗しました: ${String(e)}`);
    }
  };

  // ---------- 削除（コンテキストメニュー） ----------

  const deletePath = (path: string, kind: "note" | "folder") => {
    setContextMenu(null);
    void confirmDialog({
      title: kind === "note" ? "ノートを削除" : "フォルダを削除",
      message:
        kind === "folder"
          ? `フォルダ「${displayName(path.split("/").pop() ?? path)}」と中身をすべて削除しますか？`
          : `「${displayName(path.split("/").pop() ?? path)}」を削除しますか？`,
      danger: true,
    }).then(async (ok) => {
      if (!ok || root === null) return;
      try {
        await deleteNotePath(root, path);
        if (selectedPath === path || (kind === "folder" && selectedPath?.startsWith(`${path}/`))) {
          setSelectedPath(null);
          setContent("");
          setDirty(false);
        }
        if (activePath === path) setActivePath(null);
        await reloadTree(root);
      } catch (e) {
        setStatus(`削除に失敗しました: ${String(e)}`);
      }
    });
  };

  const changeRoot = async () => {
    const dir = await open({ directory: true, title: "ノートの保存先フォルダを選択" });
    if (typeof dir !== "string") return;
    await saveCurrent();
    await setNotesRoot(dir);
    setRoot(dir);
    setSelectedPath(null);
    setActivePath(null);
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

  const handleFolderClick = (path: string) => {
    if (activePath === path) {
      startRename(path, "folder");
      return;
    }
    setActivePath(path);
    toggleExpand(path);
  };

  const handleFileClick = (path: string) => {
    if (activePath === path && selectedPath === path) {
      startRename(path, "note");
      return;
    }
    void openNote(path);
  };

  const renderInlineInput = (
    defaultValue: string,
    onCommit: (value: string) => void,
    onCancel: () => void,
  ) => (
    <input
      type="text"
      className="note-tree-rename-input"
      defaultValue={defaultValue}
      autoFocus
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.nativeEvent.isComposing) onCommit(e.currentTarget.value);
        if (e.key === "Escape") onCancel();
      }}
      onBlur={(e) => onCommit(e.target.value)}
      onClick={(e) => e.stopPropagation()}
    />
  );

  const renderNodes = (nodes: NoteNode[], depth: number, dirPath: string) => (
    <ul className="note-tree" style={{ paddingLeft: depth === 0 ? 0 : 14 }}>
      {nodes.map((node) => (
        <li key={node.path}>
          {node.kind === "dir" ? (
            <>
              {renaming?.path === node.path ? (
                <div className="note-tree-row dir renaming">
                  <span className="tree-caret" aria-hidden="true">
                    <IconChevronRight size={12} />
                  </span>
                  <span className="note-tree-icon">
                    <IconFolder size={14} />
                  </span>
                  {renderInlineInput(
                    node.name,
                    (v) => void commitRename(renaming, v),
                    () => setRenaming(null),
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className={`note-tree-row dir ${activePath === node.path ? "active" : ""}`}
                  onClick={() => handleFolderClick(node.path)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ path: node.path, kind: "folder", x: e.clientX, y: e.clientY });
                  }}
                >
                  <span
                    className={`tree-caret ${expanded.has(node.path) ? "open" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(node.path);
                    }}
                  >
                    <IconChevronRight size={12} />
                  </span>
                  <span className="note-tree-icon">
                    <IconFolder size={14} />
                  </span>
                  <span className="note-tree-name">{node.name}</span>
                </button>
              )}
              {expanded.has(node.path) && renderNodes(node.children, depth + 1, node.path)}
            </>
          ) : renaming?.path === node.path ? (
            <div className="note-tree-row file renaming">
              <span className="note-tree-icon">
                <IconDoc size={14} />
              </span>
              {renderInlineInput(
                displayName(node.name),
                (v) => void commitRename(renaming, v),
                () => setRenaming(null),
              )}
            </div>
          ) : (
            <button
              type="button"
              className={`note-tree-row file ${node.path === selectedPath ? "active" : ""}`}
              onClick={() => handleFileClick(node.path)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ path: node.path, kind: "note", x: e.clientX, y: e.clientY });
              }}
            >
              <span className="note-tree-icon">
                <IconDoc size={14} />
              </span>
              <span className="note-tree-name">{displayName(node.name)}</span>
            </button>
          )}
        </li>
      ))}
      {pendingNew !== null && pendingNew.dir === dirPath && <li>{renderGhostRow(pendingNew)}</li>}
    </ul>
  );

  const renderGhostRow = (pending: PendingNew) => (
    <div className={`note-tree-row ${pending.kind === "folder" ? "dir" : "file"} renaming`}>
      {pending.kind === "folder" ? (
        <span className="tree-caret" aria-hidden="true">
          <IconChevronRight size={12} />
        </span>
      ) : null}
      <span className="note-tree-icon">
        {pending.kind === "folder" ? <IconFolder size={14} /> : <IconDoc size={14} />}
      </span>
      {renderInlineInput(
        pending.kind === "folder" ? "新しいフォルダ" : "新しいノート",
        (v) => void commitCreate(pending.dir, pending.kind, v),
        () => setPendingNew(null),
      )}
    </div>
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
            onClick={() => beginCreate("note")}
          >
            <IconPlus size={14} />
          </button>
          <button
            type="button"
            className="ghost-icon-btn"
            title="新しいフォルダ"
            aria-label="新しいフォルダ"
            onClick={() => beginCreate("folder")}
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
          renderNodes(tree, 0, "")
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
            <p>左のツリーからノートを選ぶか、「+」で作成してください</p>
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
      {contextMenu !== null && (
        <>
          <div className="popover-backdrop" onPointerDown={() => setContextMenu(null)} />
          <div
            className="note-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => startRename(contextMenu.path, contextMenu.kind)}
            >
              名前を変更
            </button>
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => deletePath(contextMenu.path, contextMenu.kind)}
            >
              削除
            </button>
          </div>
        </>
      )}
    </div>
  );
}
