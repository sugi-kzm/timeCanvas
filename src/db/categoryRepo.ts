import type { Category } from "../types";
import { toLocalIso } from "../lib/dates";
import { DEFAULT_CATEGORIES } from "../lib/colors";
import { getDb } from "./database";

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  archived: number;
  sort_order: number;
  created_at: string;
}

function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    archived: row.archived !== 0,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.select<CategoryRow[]>(
    "SELECT * FROM categories WHERE archived = 0 ORDER BY sort_order, created_at",
  );
  return rows.map(rowToCategory);
}

export async function createCategory(name: string, color: string): Promise<Category> {
  const db = await getDb();
  const now = toLocalIso(new Date());
  const maxRows = await db.select<{ max_order: number | null }[]>(
    "SELECT MAX(sort_order) AS max_order FROM categories",
  );
  const sortOrder = (maxRows[0]?.max_order ?? -1) + 1;
  const category: Category = {
    id: crypto.randomUUID(),
    name,
    color,
    archived: false,
    sortOrder,
    createdAt: now,
  };
  await db.execute(
    "INSERT INTO categories (id, name, color, archived, sort_order, created_at) VALUES ($1, $2, $3, 0, $4, $5)",
    [category.id, category.name, category.color, category.sortOrder, category.createdAt],
  );
  return category;
}

export async function updateCategory(category: Category): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE categories SET name = $1, color = $2, sort_order = $3 WHERE id = $4",
    [category.name, category.color, category.sortOrder, category.id],
  );
}

export async function archiveCategory(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE categories SET archived = 1 WHERE id = $1", [id]);
}

/** 初回起動時に既定カテゴリを投入する（固定 ID + INSERT OR IGNORE で何度呼んでも安全） */
export async function ensureDefaultCategories(): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ cnt: number }[]>("SELECT COUNT(*) AS cnt FROM categories");
  if ((rows[0]?.cnt ?? 0) > 0) return;
  const now = toLocalIso(new Date());
  for (const [index, seed] of DEFAULT_CATEGORIES.entries()) {
    await db.execute(
      "INSERT OR IGNORE INTO categories (id, name, color, archived, sort_order, created_at) VALUES ($1, $2, $3, 0, $4, $5)",
      [`default-${index}`, seed.name, seed.color, index, now],
    );
  }
}
