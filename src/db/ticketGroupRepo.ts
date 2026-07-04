import type { TicketGroup } from "../types";
import { toLocalIso } from "../lib/dates";
import { getDb } from "./database";

interface GroupRow {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

function rowToGroup(row: GroupRow): TicketGroup {
  return { id: row.id, name: row.name, sortOrder: row.sort_order, createdAt: row.created_at };
}

export async function listTicketGroups(): Promise<TicketGroup[]> {
  const db = await getDb();
  const rows = await db.select<GroupRow[]>(
    "SELECT * FROM ticket_groups ORDER BY sort_order, created_at",
  );
  return rows.map(rowToGroup);
}

export async function createTicketGroup(name: string): Promise<TicketGroup> {
  const db = await getDb();
  const now = toLocalIso(new Date());
  const maxRows = await db.select<{ max_order: number | null }[]>(
    "SELECT MAX(sort_order) AS max_order FROM ticket_groups",
  );
  const group: TicketGroup = {
    id: crypto.randomUUID(),
    name,
    sortOrder: (maxRows[0]?.max_order ?? -1) + 1,
    createdAt: now,
  };
  await db.execute(
    "INSERT INTO ticket_groups (id, name, sort_order, created_at) VALUES ($1, $2, $3, $4)",
    [group.id, group.name, group.sortOrder, group.createdAt],
  );
  return group;
}

export async function renameTicketGroup(id: string, name: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE ticket_groups SET name = $1 WHERE id = $2", [name, id]);
}

/** 分類を削除する。所属していたチケット/タスクは分類なしに戻る */
export async function deleteTicketGroup(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE tasks SET group_id = NULL WHERE group_id = $1", [id]);
  await db.execute("DELETE FROM ticket_groups WHERE id = $1", [id]);
}

const DEFAULT_GROUP_NAMES = ["自学習", "プロジェクト"] as const;

/** 初回起動時に既定の分類を投入する */
export async function ensureDefaultTicketGroups(): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ cnt: number }[]>("SELECT COUNT(*) AS cnt FROM ticket_groups");
  if ((rows[0]?.cnt ?? 0) > 0) return;
  const now = toLocalIso(new Date());
  for (const [index, name] of DEFAULT_GROUP_NAMES.entries()) {
    await db.execute(
      "INSERT OR IGNORE INTO ticket_groups (id, name, sort_order, created_at) VALUES ($1, $2, $3, $4)",
      [`default-group-${index}`, name, index, now],
    );
  }
}
