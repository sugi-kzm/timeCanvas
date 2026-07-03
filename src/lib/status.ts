import type { TaskStatus } from "../types";

export interface StatusConfig {
  key: TaskStatus;
  label: string;
  /** ドット・チップの色 */
  dot: string;
  /** カンバン列・チップの背景色 */
  bg: string;
  /** チップの文字色 */
  text: string;
}

/** Notion の既定パレットに近い配色 */
export const TASK_STATUSES: readonly StatusConfig[] = [
  { key: "todo", label: "To-Do", dot: "#9065B0", bg: "#F6F3F9", text: "#65427F" },
  { key: "in_progress", label: "進行中", dot: "#C29343", bg: "#FBF3DB", text: "#8A6116" },
  { key: "review", label: "レビュー中", dot: "#3283A8", bg: "#E9F3F7", text: "#1F5D77" },
  { key: "done", label: "完了", dot: "#448361", bg: "#EDF3EC", text: "#2B593F" },
] as const;

export function statusConfig(status: TaskStatus): StatusConfig {
  return TASK_STATUSES.find((s) => s.key === status) ?? TASK_STATUSES[0];
}

/** DB の生値を TaskStatus に正規化する（旧 'open' は 'todo' 扱い） */
export function normalizeStatus(raw: string): TaskStatus {
  if (raw === "in_progress" || raw === "review" || raw === "done") return raw;
  return "todo";
}
