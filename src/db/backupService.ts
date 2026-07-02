import { invoke } from "@tauri-apps/api/core";
import { toLocalIso, fromLocalIso } from "../lib/dates";
import { getDb } from "./database";
import { getSetting, setSetting, SETTING_KEYS } from "./settingsRepo";

export const BACKUP_KEEP_GENERATIONS = 30;
const DAILY_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface BackupResult {
  ok: boolean;
  skipped: boolean;
  message: string;
}

function backupFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `timecanvas-backup-${stamp}.db`;
}

function joinPath(dir: string, file: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith(sep) ? `${dir}${file}` : `${dir}${sep}${file}`;
}

/**
 * バックアップフォルダへ SQLite の安全なスナップショット（VACUUM INTO）を書き出し、
 * 古い世代を削除する。フォルダ未設定時はスキップ。
 */
export async function runBackup(): Promise<BackupResult> {
  const dir = await getSetting(SETTING_KEYS.backupDir);
  if (dir === null || dir === "") {
    return { ok: true, skipped: true, message: "バックアップ先が未設定のためスキップしました" };
  }
  try {
    const db = await getDb();
    const now = new Date();
    const path = joinPath(dir, backupFileName(now));
    // VACUUM INTO はパラメータバインド不可のためエスケープして埋め込む
    await db.execute(`VACUUM INTO '${path.replaceAll("'", "''")}'`);
    await invoke<number>("prune_backups", { dir, keep: BACKUP_KEEP_GENERATIONS });
    await setSetting(SETTING_KEYS.lastBackupAt, toLocalIso(now));
    return { ok: true, skipped: false, message: `バックアップを保存しました: ${path}` };
  } catch (e) {
    return { ok: false, skipped: false, message: `バックアップに失敗しました: ${String(e)}` };
  }
}

/** 前回バックアップから 24 時間以上経過していれば実行する */
export async function runDailyBackupIfDue(): Promise<BackupResult | null> {
  const last = await getSetting(SETTING_KEYS.lastBackupAt);
  if (last !== null) {
    const elapsed = Date.now() - fromLocalIso(last).getTime();
    if (elapsed < DAILY_BACKUP_INTERVAL_MS) return null;
  }
  return runBackup();
}

/** OneDrive フォルダの自動検出（見つからなければ null） */
export async function detectOneDriveDir(): Promise<string | null> {
  const dir = await invoke<string | null>("detect_onedrive_dir");
  return dir ?? null;
}
