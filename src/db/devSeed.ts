import { toLocalIso } from "../lib/dates";
import { getDb } from "./database";

/** サンプルデータのタイトルに付与するプレフィックス。削除時の一括検索に使う */
export const SAMPLE_PREFIX = "[sample]";

/** 再現性のある擬似乱数（固定シード。日付は今日基準のため、同じ日のうちは同じ分布になる） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 20260708;

interface SeedTicketSpec {
  title: string;
  status: "todo" | "in_progress" | "done";
  categoryIndex: number;
  groupIndex: 0 | 1;
  /** 見積（分）。分析の「見積vs実績」「補正係数」を確認できるよう大半に設定する */
  estimateMinutes?: number;
  daysAgoCompleted?: number;
  children?: SeedChildSpec[];
}

interface SeedChildSpec {
  title: string;
  status: "todo" | "in_progress" | "done";
  estimateMinutes?: number;
  grandchild?: string;
}

/** 進行中/未着手（子・孫タスクの階層確認用を含む） */
const ACTIVE_TICKETS: SeedTicketSpec[] = [
  {
    title: "TypeScript 型システムの復習",
    status: "in_progress",
    categoryIndex: 2,
    groupIndex: 0,
    estimateMinutes: 600,
    children: [
      {
        title: "ジェネリクスの練習問題を解く",
        status: "in_progress",
        estimateMinutes: 180,
        grandchild: "型パズルを1問解く",
      },
      { title: "ユーティリティ型のまとめノート作成", status: "todo", estimateMinutes: 120 },
    ],
  },
  {
    title: "アルゴリズム問題集 第3章",
    status: "in_progress",
    categoryIndex: 2,
    groupIndex: 0,
    estimateMinutes: 480,
  },
  { title: "React 19 の新機能を試す", status: "todo", categoryIndex: 0, groupIndex: 0 },
  {
    title: "SQLite インデックス設計の学習",
    status: "todo",
    categoryIndex: 2,
    groupIndex: 0,
    estimateMinutes: 240,
  },
  {
    title: "個人ブログのリニューアル",
    status: "in_progress",
    categoryIndex: 1,
    groupIndex: 0,
    estimateMinutes: 900,
    children: [
      { title: "デザイン案の作成", status: "done", estimateMinutes: 240 },
      { title: "記事移行スクリプトの実装", status: "todo", estimateMinutes: 300 },
    ],
  },
];

/** 完了済み。completedAt を過去1年へ分散し、履歴の週/月/年ビューすべてに実績が出るようにする */
const DONE_TICKETS: SeedTicketSpec[] = [
  ["顧客管理画面のリリース", 0, 1, 2, 900],
  ["月次レポート自動化バッチの開発", 0, 1, 5, 600],
  ["ログ基盤の移行", 0, 1, 9, 720],
  ["社内API仕様書の整備", 3, 1, 14, 300],
  ["決済モジュールの不具合修正", 0, 1, 21, 240],
  ["負荷テストの実施", 2, 1, 30, 360],
  ["旧システムからのデータ移行", 0, 1, 41, 840],
  ["管理画面の権限まわり改修", 0, 1, 55, 480],
  ["CI パイプラインの高速化", 2, 1, 70, 300],
  ["顧客ヒアリング資料の作成", 3, 1, 90, 180],
  ["検索機能のリプレイス", 0, 1, 110, 960],
  ["モバイル対応の調査", 2, 0, 135, 240],
  ["年次棚卸しレポート", 3, 1, 160, 300],
  ["バックアップ手順の自動化", 0, 1, 190, 360],
  ["Rust 入門書を読み切る", 2, 0, 220, 720],
  ["社内勉強会の登壇準備", 3, 0, 250, 240],
  ["監視アラートの整理", 0, 1, 280, 180],
  ["デザインシステムの導入検討", 1, 1, 310, 420],
  ["英語技術記事の翻訳", 1, 0, 340, 300],
  ["開発環境セットアップ手順書", 3, 1, 360, 120],
].map(([title, categoryIndex, groupIndex, daysAgoCompleted, estimateMinutes]) => ({
  title: title as string,
  status: "done" as const,
  categoryIndex: categoryIndex as number,
  groupIndex: groupIndex as 0 | 1,
  daysAgoCompleted: daysAgoCompleted as number,
  estimateMinutes: estimateMinutes as number,
}));

const SAMPLE_TICKETS: SeedTicketSpec[] = [...ACTIVE_TICKETS, ...DONE_TICKETS];

const ENTRY_TITLES = [
  "設計資料の読み込み",
  "実装作業",
  "動作確認",
  "コードレビュー対応",
  "打ち合わせ",
  "調査・情報収集",
  "ドキュメント作成",
  "デバッグ",
];

/** 過去何日分のエントリを生成するか（年ビュー全域をカバー） */
const ENTRY_DAYS = 365;
const DURATIONS = [30, 60, 90, 120, 180];
/** 一括 INSERT のチャンクサイズ。9 パラメータ × 100 = 900 < SQLite の変数上限 999 */
const ENTRY_CHUNK_SIZE = 100;

function daysAgo(n: number, hour: number, minute: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
}

interface LinkableTask {
  id: string;
  /** このタスクに紐付ける実績は最低でも n 日前（完了日以前）である必要がある */
  minDaysAgo: number;
  categoryId: string | null;
}

interface EntryRow {
  id: string;
  title: string;
  categoryId: string | null;
  startAt: string;
  endAt: string;
  taskId: string | null;
  createdAt: string;
}

/**
 * 開発ビルド専用のサンプルデータ投入。既存の分類/カテゴリを再利用し、
 * [sample] 接頭辞付きのチケット・実績を作成する。
 * 冒頭で既存のサンプルデータを削除するため、繰り返し実行しても重複しない。
 */
export async function seedSampleData(): Promise<void> {
  await deleteSampleData();

  const db = await getDb();
  const rand = mulberry32(SEED);

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

  const linkable: LinkableTask[] = [];

  const insertTask = async (
    title: string,
    status: string,
    categoryId: string | null,
    groupId: string | null,
    parentId: string | null,
    estimateMinutes: number | null,
    completedAt: string | null,
  ): Promise<string> => {
    const id = crypto.randomUUID();
    await db.execute(
      `INSERT INTO tasks (id, display_no, title, memo, category_id, group_id, estimate_minutes, status, due_date, parent_id, start_date, sort_order, created_at, updated_at, completed_at)
       VALUES ($1, $2, $3, '', $4, $5, $6, $7, NULL, $8, NULL, $9, $10, $10, $11)`,
      [
        id,
        nextDisplayNo++,
        `${SAMPLE_PREFIX} ${title}`,
        categoryId,
        groupId,
        estimateMinutes,
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
    const ticketId = await insertTask(
      spec.title,
      spec.status,
      categoryId,
      groupId,
      null,
      spec.estimateMinutes ?? null,
      completedAt,
    );
    linkable.push({ id: ticketId, minDaysAgo: spec.daysAgoCompleted ?? 0, categoryId });

    for (const child of spec.children ?? []) {
      const childId = await insertTask(
        child.title,
        child.status,
        categoryId,
        groupId,
        ticketId,
        child.estimateMinutes ?? null,
        null,
      );
      linkable.push({ id: childId, minDaysAgo: 0, categoryId });
      if (child.grandchild !== undefined) {
        const grandchildId = await insertTask(
          child.grandchild,
          "todo",
          categoryId,
          groupId,
          childId,
          null,
          null,
        );
        linkable.push({ id: grandchildId, minDaysAgo: 0, categoryId });
      }
    }
  }

  const rows = buildEntryRows(rand, linkable, categoryIds, now);
  await insertEntriesChunked(db, rows);
}

/** 過去 ENTRY_DAYS 日分の実績エントリを生成する（平日多め・週末少なめ・8〜22時開始） */
function buildEntryRows(
  rand: () => number,
  linkable: readonly LinkableTask[],
  categoryIds: readonly (string | null)[],
  createdAt: string,
): EntryRow[] {
  const rows: EntryRow[] = [];
  for (let dayOffset = 0; dayOffset < ENTRY_DAYS; dayOffset++) {
    const date = daysAgo(dayOffset, 0, 0);
    const dow = date.getDay();
    const isWeekend = dow === 0 || dow === 6;
    if (rand() > (isWeekend ? 0.3 : 0.75)) continue;
    const count = isWeekend ? 1 + Math.floor(rand() * 2) : 1 + Math.floor(rand() * 3);

    for (let i = 0; i < count; i++) {
      // 1日を午前/昼過ぎ/夕方の帯に分けて重なりを避ける（8〜21時開始）
      const baseHour = 8 + i * 5;
      const startHour = Math.min(21, baseHour + Math.floor(rand() * 3));
      const startMinute = rand() < 0.5 ? 0 : 30;
      const start = daysAgo(dayOffset, startHour, startMinute);
      const maxDuration = (23 - startHour) * 60 - startMinute;
      const duration = Math.min(DURATIONS[Math.floor(rand() * DURATIONS.length)], maxDuration);
      if (duration < 30) continue;
      const end = new Date(start.getTime() + duration * 60_000);

      // 約半数をタスクへ紐付ける。完了済みチケットには完了日以前の実績のみ紐付ける
      let taskId: string | null = null;
      let categoryId = categoryIds[Math.floor(rand() * categoryIds.length)] ?? null;
      if (rand() < 0.5) {
        const candidates = linkable.filter((t) => dayOffset >= t.minDaysAgo);
        if (candidates.length > 0) {
          const picked = candidates[Math.floor(rand() * candidates.length)];
          taskId = picked.id;
          if (picked.categoryId !== null) categoryId = picked.categoryId;
        }
      }

      rows.push({
        id: crypto.randomUUID(),
        title: `${SAMPLE_PREFIX} ${ENTRY_TITLES[Math.floor(rand() * ENTRY_TITLES.length)]}`,
        categoryId,
        startAt: toLocalIso(start),
        endAt: toLocalIso(end),
        taskId,
        createdAt,
      });
    }
  }
  return rows;
}

/** 1件ずつの INSERT は IPC 往復で遅いため、チャンクに分けて一括挿入する */
async function insertEntriesChunked(
  db: Awaited<ReturnType<typeof getDb>>,
  rows: readonly EntryRow[],
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += ENTRY_CHUNK_SIZE) {
    const chunk = rows.slice(offset, offset + ENTRY_CHUNK_SIZE);
    const placeholders: string[] = [];
    const params: (string | null)[] = [];
    chunk.forEach((row, i) => {
      const base = i * 9;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`,
      );
      params.push(
        row.id,
        row.title,
        row.categoryId,
        row.startAt,
        row.endAt,
        "",
        row.taskId,
        row.createdAt,
        row.createdAt,
      );
    });
    await db.execute(
      `INSERT INTO time_entries (id, title, category_id, start_at, end_at, memo, task_id, created_at, updated_at)
       VALUES ${placeholders.join(", ")}`,
      params,
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
