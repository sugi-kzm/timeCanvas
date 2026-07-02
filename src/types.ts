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
}

export type ViewKind = "calendar" | "tasks" | "analytics" | "notes";
