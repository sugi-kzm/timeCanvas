export interface Category {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface TimeEntry {
  id: string;
  title: string;
  categoryId: string | null;
  /** ローカル時刻の "YYYY-MM-DDTHH:mm:ss" 形式 */
  startAt: string;
  endAt: string;
  memo: string;
  /** Phase 2 でタスクと紐付ける外部キー。現状は常に null */
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewEntryInput {
  title: string;
  categoryId: string | null;
  startAt: string;
  endAt: string;
  memo: string;
  taskId?: string | null;
}

export type TaskStatus = "todo" | "in_progress" | "review" | "done";

/**
 * チケットの分類（スケジュールのカテゴリとは独立した軸）。
 * 例: 「自学習」「プロジェクト」など、チケット画面の左レールで使う。
 */
export interface TicketGroup {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

/**
 * チケットとタスクの両方を表す。
 * parentId が null のものは「チケット」（大きな作業単位・ゴール）、
 * parentId を持つものはチケット配下の「タスク」（細分化した作業）。
 */
export interface Task {
  id: string;
  /** 人間向けの連番表示（"#1" 等）。作成順に採番される */
  displayNo: number;
  title: string;
  memo: string;
  categoryId: string | null;
  /** チケットの分類（自学習・プロジェクト等）。カテゴリとは別軸 */
  groupId: string | null;
  /** 見積時間（分）。未設定は null */
  estimateMinutes: number | null;
  status: TaskStatus;
  /** ガント用の開始日 "YYYY-MM-DD"。未設定は null */
  startDate: string | null;
  /** "YYYY-MM-DD" 形式の期限。未設定は null */
  dueDate: string | null;
  /** 親チケットの id。チケット自身は null */
  parentId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export type ViewKind = "calendar" | "tasks" | "analytics" | "notes" | "history";

export type CalendarMode = "day" | "week" | "month";
