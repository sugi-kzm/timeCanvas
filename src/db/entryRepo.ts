import type { NewEntryInput, TimeEntry } from "../types";
import { toLocalIso } from "../lib/dates";
import { getDb } from "./database";

interface EntryRow {
  id: string;
  title: string;
  category_id: string | null;
  start_at: string;
  end_at: string;
  memo: string;
  task_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToEntry(row: EntryRow): TimeEntry {
  return {
    id: row.id,
    title: row.title,
    categoryId: row.category_id,
    startAt: row.start_at,
    endAt: row.end_at,
    memo: row.memo,
    taskId: row.task_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 開始時刻が [fromIso, toIso) に入るエントリを取得 */
export async function listEntriesBetween(fromIso: string, toIso: string): Promise<TimeEntry[]> {
  const db = await getDb();
  const rows = await db.select<EntryRow[]>(
    "SELECT * FROM time_entries WHERE start_at >= $1 AND start_at < $2 ORDER BY start_at",
    [fromIso, toIso],
  );
  return rows.map(rowToEntry);
}

export async function createEntry(input: NewEntryInput): Promise<TimeEntry> {
  const db = await getDb();
  const now = toLocalIso(new Date());
  const entry: TimeEntry = {
    id: crypto.randomUUID(),
    title: input.title,
    categoryId: input.categoryId,
    startAt: input.startAt,
    endAt: input.endAt,
    memo: input.memo,
    taskId: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.execute(
    `INSERT INTO time_entries (id, title, category_id, start_at, end_at, memo, task_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      entry.id,
      entry.title,
      entry.categoryId,
      entry.startAt,
      entry.endAt,
      entry.memo,
      entry.taskId,
      entry.createdAt,
      entry.updatedAt,
    ],
  );
  return entry;
}

export async function updateEntry(entry: TimeEntry): Promise<TimeEntry> {
  const db = await getDb();
  const updated: TimeEntry = { ...entry, updatedAt: toLocalIso(new Date()) };
  await db.execute(
    `UPDATE time_entries
     SET title = $1, category_id = $2, start_at = $3, end_at = $4, memo = $5, updated_at = $6
     WHERE id = $7`,
    [
      updated.title,
      updated.categoryId,
      updated.startAt,
      updated.endAt,
      updated.memo,
      updated.updatedAt,
      updated.id,
    ],
  );
  return updated;
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM time_entries WHERE id = $1", [id]);
}

/** エクスポート用に全エントリを取得 */
export async function listAllEntries(): Promise<TimeEntry[]> {
  const db = await getDb();
  const rows = await db.select<EntryRow[]>("SELECT * FROM time_entries ORDER BY start_at");
  return rows.map(rowToEntry);
}
