import { toLocalIso } from "../lib/dates";
import { getDb } from "./database";

/** サンプルデータのタイトルに付与するプレフィックス。削除時の一括検索に使う */
export const SAMPLE_PREFIX = "[sample]";

interface SeedTicketSpec {
  title: string;
  status: "todo" | "in_progress" | "done";
  categoryIndex: number;
  groupIndex: 0 | 1;
  daysAgoCompleted?: number;
  children?: SeedChildSpec[];
}

interface SeedChildSpec {
  title: string;
  status: "todo" | "in_progress" | "done";
  grandchild?: string;
}

const SAMPLE_TICKETS: SeedTicketSpec[] = [
  {
    title: "TypeScript 型システムの復習",
    status: "in_progress",
    categoryIndex: 2,
    groupIndex: 0,
    children: [
      { title: "ジェネリクスの練習問題を解く", status: "in_progress", grandchild: "型パズルを1問解く" },
      { title: "ユーティリティ型のまとめノート作成", status: "todo" },
    ],
  },
  { title: "アルゴリズム問題集 第3章", status: "in_progress", categoryIndex: 2, groupIndex: 0 },
  { title: "React 19 の新機能を試す", status: "todo", categoryIndex: 0, groupIndex: 0 },
  { title: "SQLite インデックス設計の学習", status: "todo", categoryIndex: 2, groupIndex: 0 },
  {
    title: "顧客管理画面のリリース",
    status: "done",
    categoryIndex: 0,
    groupIndex: 1,
    daysAgoCompleted: 3,
  },
  {
    title: "月次レポート自動化バッチの開発",
    status: "done",
    categoryIndex: 0,
    groupIndex: 1,
    daysAgoCompleted: 20,
  },
  {
    title: "社内API仕様書の整備",
    status: "done",
    categoryIndex: 3,
    groupIndex: 1,
    daysAgoCompleted: 40,
  },
  {
    title: "旧システムからのデータ移行",
    status: "done",
    categoryIndex: 0,
    groupIndex: 1,
    daysAgoCompleted: 58,
  },
];

function daysAgo(n: number, hour: number, minute: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** 開発ビルド専用のサンプルデータ投入。既存の分類/カテゴリを再利用し、[sample] 接頭辞付きのチケット・実績を作成する */
export async function seedSampleData(): Promise<void> {
  const db = await getDb();

  const groupRows = await db.select<{ id: string; sort_order: number }[]>(
    "SELECT id, sort_order FROM ticket_groups ORDER BY sort_order LIMIT 2",
  );
  const categoryRows = await db.select<{ id: string; sort_order: number }[]>(
    "SELECT id, sort_order FROM categories WHERE archived = 0 ORDER BY sort_order LIMIT 4",
  );
  if (groupRows.length < 2 || categoryRows.length < 4) {
    throw new Error("分類またはカテゴリが不足しています（既定データの初期化が未完了の可能性）");
  }
  const groupIds = groupRows.map((r) => r.id);
  const categoryIds = categoryRows.map((r) => r.id);

  const now = toLocalIso(new Date());
  const maxDisplayNoRows = await db.select<{ max_display_no: number | null }[]>(
    "SELECT MAX(display_no) AS max_display_no FROM tasks",
  );
  let nextDisplayNo = (maxDisplayNoRows[0]?.max_display_no ?? 0) + 1;
  const maxSortRows = await db.select<{ max_order: number | null }[]>(
    "SELECT MAX(sort_order) AS max_order FROM tasks",
  );
  let nextSortOrder = (maxSortRows[0]?.max_order ?? -1) + 1;

  const ticketIds: string[] = [];
  const childIds: string[] = [];
  const grandchildIds: string[] = [];

  const insertTask = async (
    title: string,
    status: string,
    categoryId: string | null,
    groupId: string | null,
    parentId: string | null,
    completedAt: string | null,
  ): Promise<string> => {
    const id = crypto.randomUUID();
    await db.execute(
      `INSERT INTO tasks (id, display_no, title, memo, category_id, group_id, estimate_minutes, status, due_date, parent_id, start_date, sort_order, created_at, updated_at, completed_at)
       VALUES ($1, $2, $3, '', $4, $5, NULL, $6, NULL, $7, NULL, $8, $9, $9, $10)`,
      [
        id,
        nextDisplayNo++,
        `${SAMPLE_PREFIX} ${title}`,
        categoryId,
        groupId,
        status,
        parentId,
        nextSortOrder++,
        now,
        completedAt,
      ],
    );
    return id;
  };

  for (const spec of SAMPLE_TICKETS) {
    const categoryId = categoryIds[spec.categoryIndex] ?? null;
    const groupId = groupIds[spec.groupIndex] ?? null;
    const completedAt =
      spec.status === "done" && spec.daysAgoCompleted !== undefined
        ? toLocalIso(daysAgo(spec.daysAgoCompleted, 17, 30))
        : null;
    const ticketId = await insertTask(spec.title, spec.status, categoryId, groupId, null, completedAt);
    ticketIds.push(ticketId);

    for (const child of spec.children ?? []) {
      const childId = await insertTask(child.title, child.status, categoryId, groupId, ticketId, null);
      childIds.push(childId);
      if (child.grandchild !== undefined) {
        const grandchildId = await insertTask(
          child.grandchild,
          "todo",
          categoryId,
          groupId,
          childId,
          null,
        );
        grandchildIds.push(grandchildId);
      }
    }
  }

  const linkableTaskIds = [...ticketIds, ...childIds, ...grandchildIds];
  const entryTitles = [
    "設計資料の読み込み",
    "実装作業",
    "動作確認",
    "コードレビュー対応",
    "打ち合わせ",
    "調査・情報収集",
    "ドキュメント作成",
    "デバッグ",
  ];

  const ENTRY_COUNT = 30;
  for (let i = 0; i < ENTRY_COUNT; i++) {
    const dayOffset = Math.floor((i / ENTRY_COUNT) * 21);
    const startHour = 9 + ((i * 3) % 9);
    const startMinute = (i % 2) * 30;
    const start = daysAgo(dayOffset, startHour, startMinute);
    const durationMinutes = 30 + (i % 4) * 30;
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    if (end.getHours() >= 19 && end.getMinutes() > 0) {
      end.setHours(19, 0, 0, 0);
    }
    const taskId = i % 2 === 0 ? linkableTaskIds[i % linkableTaskIds.length] : null;
    const categoryId = categoryIds[i % categoryIds.length] ?? null;
    const title = `${SAMPLE_PREFIX} ${entryTitles[i % entryTitles.length]}`;
    const entryId = crypto.randomUUID();
    const createdAt = toLocalIso(new Date());
    await db.execute(
      `INSERT INTO time_entries (id, title, category_id, start_at, end_at, memo, task_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, '', $6, $7, $7)`,
      [entryId, title, categoryId, toLocalIso(start), toLocalIso(end), taskId, createdAt],
    );
  }
}

/** [sample] 接頭辞のタイトルを持つタスク・実績を一括削除する */
export async function deleteSampleData(): Promise<void> {
  const db = await getDb();
  const pattern = `${SAMPLE_PREFIX}%`;
  await db.execute("DELETE FROM time_entries WHERE title LIKE $1", [pattern]);
  await db.execute(
    "UPDATE time_entries SET task_id = NULL WHERE task_id IN (SELECT id FROM tasks WHERE title LIKE $1)",
    [pattern],
  );
  await db.execute("DELETE FROM tasks WHERE title LIKE $1", [pattern]);
}
