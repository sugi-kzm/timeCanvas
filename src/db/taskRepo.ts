import type { Task } from "../types";
import { toLocalIso } from "../lib/dates";
import { normalizeStatus } from "../lib/status";
import { getDb } from "./database";

interface TaskRow {
  id: string;
  title: string;
  memo: string;
  category_id: string | null;
  estimate_minutes: number | null;
  status: string;
  due_date: string | null;
  parent_id: string | null;
  start_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    memo: row.memo,
    categoryId: row.category_id,
    estimateMinutes: row.estimate_minutes,
    status: normalizeStatus(row.status),
    startDate: row.start_date,
    dueDate: row.due_date,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

/** 未完了すべてと、完了済みの直近 100 件を返す（チケット・タスク混在） */
export async function listTasks(): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.select<TaskRow[]>(
    `SELECT * FROM tasks
     WHERE status != 'done'
     ORDER BY sort_order, created_at`,
  );
  const doneRows = await db.select<TaskRow[]>(
    `SELECT * FROM tasks
     WHERE status = 'done'
     ORDER BY completed_at DESC
     LIMIT 100`,
  );
  return [...rows, ...doneRows].map(rowToTask);
}

export async function createTask(
  title: string,
  categoryId: string | null,
  parentId: string | null = null,
): Promise<Task> {
  const db = await getDb();
  const now = toLocalIso(new Date());
  const maxRows = await db.select<{ max_order: number | null }[]>(
    "SELECT MAX(sort_order) AS max_order FROM tasks",
  );
  const task: Task = {
    id: crypto.randomUUID(),
    title,
    memo: "",
    categoryId,
    estimateMinutes: null,
    status: "todo",
    startDate: null,
    dueDate: null,
    parentId,
    sortOrder: (maxRows[0]?.max_order ?? -1) + 1,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  await db.execute(
    `INSERT INTO tasks (id, title, memo, category_id, estimate_minutes, status, due_date, parent_id, start_date, sort_order, created_at, updated_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      task.id,
      task.title,
      task.memo,
      task.categoryId,
      task.estimateMinutes,
      task.status,
      task.dueDate,
      task.parentId,
      task.startDate,
      task.sortOrder,
      task.createdAt,
      task.updatedAt,
      task.completedAt,
    ],
  );
  return task;
}

export async function updateTask(task: Task): Promise<Task> {
  const db = await getDb();
  const updated: Task = { ...task, updatedAt: toLocalIso(new Date()) };
  await db.execute(
    `UPDATE tasks
     SET title = $1, memo = $2, category_id = $3, estimate_minutes = $4,
         status = $5, due_date = $6, parent_id = $7, start_date = $8, sort_order = $9,
         updated_at = $10, completed_at = $11
     WHERE id = $12`,
    [
      updated.title,
      updated.memo,
      updated.categoryId,
      updated.estimateMinutes,
      updated.status,
      updated.dueDate,
      updated.parentId,
      updated.startDate,
      updated.sortOrder,
      updated.updatedAt,
      updated.completedAt,
      updated.id,
    ],
  );
  return updated;
}

/**
 * チケット/タスクを削除する。チケットの場合は子タスクも削除し、
 * 紐付いていた実績はすべてタスクなしに戻す（実績自体は残す）
 */
export async function deleteTask(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE time_entries SET task_id = NULL WHERE task_id = $1 OR task_id IN (SELECT id FROM tasks WHERE parent_id = $1)",
    [id],
  );
  await db.execute("DELETE FROM tasks WHERE parent_id = $1", [id]);
  await db.execute("DELETE FROM tasks WHERE id = $1", [id]);
}

/** タスクごとの実績合計（分）。task_id が付いた全エントリを集計 */
export async function actualMinutesByTask(): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.select<{ task_id: string; minutes: number }[]>(
    `SELECT task_id, CAST(ROUND(SUM((julianday(end_at) - julianday(start_at)) * 24 * 60)) AS INTEGER) AS minutes
     FROM time_entries
     WHERE task_id IS NOT NULL
     GROUP BY task_id`,
  );
  return new Map(rows.map((r) => [r.task_id, r.minutes]));
}

export interface EntryDateRange {
  /** "YYYY-MM-DD" */
  from: string;
  to: string;
}

/** タスクごとの実績の期間（最初の記録日〜最後の記録日）。ガントの期間未設定時に使う */
export async function entryDateRangesByTask(): Promise<Map<string, EntryDateRange>> {
  const db = await getDb();
  const rows = await db.select<{ task_id: string; min_start: string; max_end: string }[]>(
    `SELECT task_id, MIN(start_at) AS min_start, MAX(end_at) AS max_end
     FROM time_entries
     WHERE task_id IS NOT NULL
     GROUP BY task_id`,
  );
  return new Map(
    rows.map((r) => [r.task_id, { from: r.min_start.slice(0, 10), to: r.max_end.slice(0, 10) }]),
  );
}
