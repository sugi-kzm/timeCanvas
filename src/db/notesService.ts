import { invoke } from "@tauri-apps/api/core";
import { appConfigDir, join } from "@tauri-apps/api/path";
import { getSetting, setSetting, SETTING_KEYS } from "./settingsRepo";

export interface NoteNode {
  name: string;
  /** ルートからの相対パス（"/" 区切り） */
  path: string;
  kind: "dir" | "file";
  children: NoteNode[];
}

export interface NoteSearchHit {
  path: string;
  line: number;
  snippet: string;
}

/** ノートの保存先。未設定なら既定（アプリ設定フォルダ内の notes/） */
export async function getNotesRoot(): Promise<string> {
  const saved = await getSetting(SETTING_KEYS.notesDir);
  if (saved !== null && saved !== "") return saved;
  return join(await appConfigDir(), "notes");
}

export async function setNotesRoot(dir: string): Promise<void> {
  await setSetting(SETTING_KEYS.notesDir, dir);
}

export function listNoteTree(root: string): Promise<NoteNode[]> {
  return invoke<NoteNode[]>("list_note_tree", { root });
}

export function readNote(root: string, rel: string): Promise<string> {
  return invoke<string>("read_note", { root, rel });
}

export function writeNote(root: string, rel: string, content: string): Promise<void> {
  return invoke<void>("write_note", { root, rel, content });
}

export function createNoteDir(root: string, rel: string): Promise<void> {
  return invoke<void>("create_note_dir", { root, rel });
}

export function renameNotePath(root: string, from: string, to: string): Promise<void> {
  return invoke<void>("rename_note_path", { root, from, to });
}

export function deleteNotePath(root: string, rel: string): Promise<void> {
  return invoke<void>("delete_note_path", { root, rel });
}

export function searchNotes(root: string, keyword: string): Promise<NoteSearchHit[]> {
  return invoke<NoteSearchHit[]>("search_notes", { root, keyword });
}
