import type { Task } from "../types";

/** 子タスク（深さ1）。自身の子＝孫タスク（深さ2、最大深度）を持てる */
export interface TicketChild extends Task {
  children: Task[];
}

/** チケット（親）とその配下のタスク（子）のグループ */
export interface TicketGroup {
  ticket: Task;
  children: TicketChild[];
}

/** チケット一覧の並び順モード。"due" は期限日優先、"manual" は手動並び替え（sortOrder）優先 */
export type TicketSortMode = "due" | "manual";

/** 作成順（sortOrder → createdAt）の比較関数 */
function byCreationOrder(a: Task, b: Task): number {
  return a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);
}

/**
 * チケットからの深さを返す。チケット自身は 0、直接の子（サブタスク）は 1、孫は 2。
 * parentId を辿れない（親が見つからない）場合は辿れた分だけの深さを返す。
 */
export function taskDepth(task: Task, allTasksById: ReadonlyMap<string, Task>): number {
  let depth = 0;
  let current = task;
  while (current.parentId !== null) {
    const parent = allTasksById.get(current.parentId);
    if (parent === undefined) break;
    depth += 1;
    current = parent;
  }
  return depth;
}

/**
 * フラットな一覧をチケット単位のグループに変換する。
 * sortMode==="due" のときはチケットを未完了→完了の順（未完了は期限日昇順、未設定は末尾）で並べる。
 * sortMode==="manual" のときはチケットを sortOrder → createdAt 順（従来の作成順ロジック）で並べる。
 * 子タスクは常に作成順。孫タスク（子タスクの子）は各子タスクの children にネストする（深さ2まで）。
 * 親が見つからない子（親が完了リミット外など）は独立チケットとして扱わず除外する。
 */
export function groupTickets(tasks: readonly Task[], sortMode: TicketSortMode): TicketGroup[] {
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const tickets = tasks.filter((t) => t.parentId === null);
  const childrenByParent = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.parentId === null) continue;
    childrenByParent.set(task.parentId, [...(childrenByParent.get(task.parentId) ?? []), task]);
  }
  const directChildren = (parentId: string) =>
    (childrenByParent.get(parentId) ?? [])
      .filter((t) => taskDepth(t, tasksById) === 1)
      .sort(byCreationOrder);
  const grandchildren = (parentId: string) =>
    (childrenByParent.get(parentId) ?? []).sort(byCreationOrder);

  const sorted = [...tickets].sort((a, b) => {
    if (sortMode === "manual") return byCreationOrder(a, b);
    const aDone = a.status === "done";
    const bDone = b.status === "done";
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (!aDone) {
      if (a.dueDate === null && b.dueDate !== null) return 1;
      if (a.dueDate !== null && b.dueDate === null) return -1;
      if (a.dueDate !== null && b.dueDate !== null && a.dueDate !== b.dueDate) {
        return a.dueDate.localeCompare(b.dueDate);
      }
    }
    return byCreationOrder(a, b);
  });
  return sorted.map((ticket) => ({
    ticket,
    children: directChildren(ticket.id).map((child) => ({
      ...child,
      children: grandchildren(child.id),
    })),
  }));
}

/** チケットの実績合計（チケット直接の実績 + 子タスク・孫タスクの実績） */
export function rollupActualMinutes(
  group: TicketGroup,
  actualByTask: ReadonlyMap<string, number>,
): number {
  const own = actualByTask.get(group.ticket.id) ?? 0;
  return group.children.reduce(
    (sum, c) =>
      sum +
      (actualByTask.get(c.id) ?? 0) +
      c.children.reduce((gSum, g) => gSum + (actualByTask.get(g.id) ?? 0), 0),
    own,
  );
}

/**
 * チケットの見積合計。
 * 子タスク・孫タスクに見積があればその合計（+チケット自身の見積）、
 * どこにも見積がなければ null。
 */
export function rollupEstimateMinutes(group: TicketGroup): number | null {
  const values = [
    group.ticket.estimateMinutes,
    ...group.children.flatMap((c) => [c.estimateMinutes, ...c.children.map((g) => g.estimateMinutes)]),
  ].filter((v): v is number => v !== null && v > 0);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0);
}

/** 複数チケットの見積合計（見積未設定のチケットは 0 として扱う） */
export function totalEstimateMinutes(groups: readonly TicketGroup[]): number {
  return groups.reduce((sum, g) => sum + (rollupEstimateMinutes(g) ?? 0), 0);
}

/** チケットの進捗（完了した子タスク数 / 子タスク数）。子がなければ null */
export function childProgress(group: TicketGroup): { done: number; total: number } | null {
  if (group.children.length === 0) return null;
  return {
    done: group.children.filter((c) => c.status === "done").length,
    total: group.children.length,
  };
}
