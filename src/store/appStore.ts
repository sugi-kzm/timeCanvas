import { create } from "zustand";
import type {
  CalendarMode,
  Category,
  NewEntryInput,
  Task,
  TaskStatus,
  TicketGroup,
  TimeEntry,
  ViewKind,
} from "../types";
import type { TicketSortMode } from "../lib/tickets";
import {
  calendarRange,
  fromLocalIso,
  shiftAnchor,
  toLocalIso,
  type WeekStartsOn,
} from "../lib/dates";
import * as categoryRepo from "../db/categoryRepo";
import * as entryRepo from "../db/entryRepo";
import * as taskRepo from "../db/taskRepo";
import * as ticketGroupRepo from "../db/ticketGroupRepo";
import { getSetting, setSetting, SETTING_KEYS } from "../db/settingsRepo";

export interface QuickCreateState {
  /** 対象日の 0:00 の Date */
  day: Date;
  startMin: number;
  endMin: number;
  /** ポップオーバー表示位置（ビューポート座標） */
  x: number;
  y: number;
}

export type EditorState =
  | {
      mode: "create";
      title: string;
      startAt: string;
      endAt: string;
      categoryId: string | null;
      taskId?: string | null;
    }
  | { mode: "edit"; entry: TimeEntry };

/** サイドバー表示の希望。"auto" は幅に応じて自動、"shown"/"hidden" はユーザーの明示指定が優先 */
export type SidebarPref = "auto" | "shown" | "hidden";

/** サイドバーの実効表示。明示指定が幅判定より優先される */
export function isSidebarVisible(pref: SidebarPref, widthOk: boolean): boolean {
  if (pref === "shown") return true;
  if (pref === "hidden") return false;
  return widthOk;
}

export type TasksViewMode = "tickets" | "board" | "gantt";

interface AppState {
  view: ViewKind;
  calendarMode: CalendarMode;
  /** 表示の基準日。週表示は含まれる週、月表示は含まれる月を表示する */
  anchorDate: Date;
  entries: TimeEntry[];
  categories: Category[];
  tasks: Task[];
  /** チケットの分類（スケジュールのカテゴリとは別軸。自学習・プロジェクト等） */
  ticketGroups: TicketGroup[];
  /** タスクID → 実績合計（分） */
  taskActualMinutes: ReadonlyMap<string, number>;
  /** タスクID → 実績の期間（開始日〜最終日）。ガントで日付未設定時の表示に使う */
  taskEntryRanges: ReadonlyMap<string, taskRepo.EntryDateRange>;
  /** チケット画面の表示モード（チケット / カンバン / ガント / 履歴） */
  tasksViewMode: TasksViewMode;
  /** 週の開始曜日（0=日曜, 1=月曜）。設定から変更できる */
  weekStartsOn: WeekStartsOn;
  /** ガントの開始位置（今日の何日前から表示するか）。設定から変更できる */
  ganttStartOffsetDays: number;
  /** ガント左ペイン（チケット一覧）の最小幅(px)。設定から変更できる */
  ganttMinLeftPaneWidth: number;
  /** 週末（土日）をカレンダーに表示するか。設定から変更できる */
  showWeekends: boolean;
  /** スケジュール表示の開始時刻（0-23時）。設定から変更できる */
  scheduleStartHour: number;
  /** チケット一覧の並び順モード（期限順 / 手動）。設定から変更できる */
  ticketSortMode: TicketSortMode;
  hiddenCategoryIds: readonly string[];
  /** サイドバー表示の希望（auto=幅に応じて / shown・hidden=手動指定が優先） */
  sidebarPref: SidebarPref;
  /** 現在のウィンドウ幅がサイドバー+本体を並べるのに足りているか（App の ResizeObserver が更新） */
  sidebarWidthOk: boolean;
  selectedEntryId: string | null;
  quickCreate: QuickCreateState | null;
  editor: EditorState | null;
  settingsOpen: boolean;
  statusMessage: string | null;
  searchKeyword: string;
  /** ツールバーの検索ボックスが展開されているか */
  searchBoxOpen: boolean;

  init: () => Promise<void>;
  setView: (view: ViewKind) => void;
  setCalendarMode: (mode: CalendarMode) => Promise<void>;
  setAnchorDate: (date: Date) => Promise<void>;
  /** 月表示などから特定の日の「日表示」へ移動する */
  showDay: (date: Date) => Promise<void>;
  goToday: () => Promise<void>;
  goNext: () => Promise<void>;
  goPrev: () => Promise<void>;
  reloadEntries: () => Promise<void>;

  addEntry: (input: NewEntryInput) => Promise<void>;
  modifyEntry: (entry: TimeEntry) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;

  addCategory: (name: string, color: string) => Promise<void>;
  updateCategory: (category: Category) => Promise<void>;
  archiveCategory: (id: string) => Promise<void>;
  toggleCategoryHidden: (id: string) => void;

  loadTasks: () => Promise<void>;
  addTask: (
    title: string,
    categoryId: string | null,
    parentId?: string | null,
    groupId?: string | null,
    overrides?: taskRepo.CreateTaskOverrides,
  ) => Promise<Task | null>;
  updateTask: (task: Task) => Promise<void>;
  toggleTaskDone: (task: Task) => Promise<void>;
  moveTaskStatus: (task: Task, status: TaskStatus) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  setTasksViewMode: (mode: TasksViewMode) => void;

  loadTicketGroups: () => Promise<void>;
  addTicketGroup: (name: string) => Promise<TicketGroup | null>;
  renameTicketGroup: (id: string, name: string) => Promise<void>;
  removeTicketGroup: (id: string) => Promise<void>;
  setWeekStartsOn: (value: WeekStartsOn) => Promise<void>;
  setGanttStartOffsetDays: (days: number) => Promise<void>;
  setGanttMinLeftPaneWidth: (px: number) => Promise<void>;
  setShowWeekends: (value: boolean) => Promise<void>;
  setScheduleStartHour: (hour: number) => Promise<void>;
  setTicketSortMode: (mode: TicketSortMode) => Promise<void>;
  reorderTickets: (idsInOrder: readonly string[]) => Promise<void>;

  toggleSidebar: () => void;
  setSidebarWidthOk: (ok: boolean) => void;

  setSearchKeyword: (keyword: string) => void;
  setSearchBoxOpen: (open: boolean) => void;
  /** 検索結果などから該当エントリの週へ移動して選択する */
  jumpToEntry: (entry: TimeEntry) => Promise<void>;

  selectEntry: (id: string | null) => void;
  openQuickCreate: (state: QuickCreateState) => void;
  closeQuickCreate: () => void;
  openEditor: (state: EditorState) => void;
  closeEditor: () => void;
  setSettingsOpen: (open: boolean) => void;
  setStatus: (message: string | null) => void;
}

function sortByStart(entries: readonly TimeEntry[]): TimeEntry[] {
  return [...entries].sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export const useAppStore = create<AppState>((set, get) => ({
  view: "calendar",
  calendarMode: "week",
  anchorDate: new Date(),
  entries: [],
  categories: [],
  tasks: [],
  ticketGroups: [],
  taskActualMinutes: new Map(),
  taskEntryRanges: new Map(),
  tasksViewMode: "tickets",
  weekStartsOn: 0,
  ganttStartOffsetDays: 3,
  ganttMinLeftPaneWidth: 120,
  showWeekends: true,
  scheduleStartHour: 9,
  ticketSortMode: "due",
  hiddenCategoryIds: [],
  sidebarPref: "auto",
  sidebarWidthOk: true,
  selectedEntryId: null,
  quickCreate: null,
  editor: null,
  settingsOpen: false,
  statusMessage: null,
  searchKeyword: "",
  searchBoxOpen: false,

  init: async () => {
    try {
      await categoryRepo.ensureDefaultCategories();
      const categories = await categoryRepo.listCategories();
      const weekStartsOn = (await getSetting(SETTING_KEYS.weekStartsOn)) === "1" ? 1 : 0;
      const offsetSetting = await getSetting(SETTING_KEYS.ganttStartOffsetDays);
      const offsetRaw = offsetSetting === null ? NaN : Number(offsetSetting);
      const ganttStartOffsetDays =
        Number.isFinite(offsetRaw) && offsetRaw >= 0 && offsetRaw <= 60 ? offsetRaw : 3;
      const minWidthSetting = await getSetting(SETTING_KEYS.ganttMinLeftPaneWidth);
      const minWidthRaw = minWidthSetting === null ? NaN : Number(minWidthSetting);
      const ganttMinLeftPaneWidth =
        Number.isFinite(minWidthRaw) && minWidthRaw >= 60 && minWidthRaw <= 600
          ? minWidthRaw
          : 120;
      const showWeekendsSetting = await getSetting(SETTING_KEYS.showWeekends);
      const showWeekends = showWeekendsSetting === null ? true : showWeekendsSetting === "1";
      const scheduleStartHourSetting = await getSetting(SETTING_KEYS.scheduleStartHour);
      const scheduleStartHourRaw =
        scheduleStartHourSetting === null ? NaN : Number(scheduleStartHourSetting);
      const scheduleStartHour =
        Number.isFinite(scheduleStartHourRaw) && scheduleStartHourRaw >= 0 && scheduleStartHourRaw <= 23
          ? scheduleStartHourRaw
          : 9;
      const ticketSortModeSetting = await getSetting(SETTING_KEYS.ticketSortMode);
      const ticketSortMode: TicketSortMode = ticketSortModeSetting === "manual" ? "manual" : "due";
      await ticketGroupRepo.ensureDefaultTicketGroups();
      set({
        categories,
        weekStartsOn,
        ganttStartOffsetDays,
        ganttMinLeftPaneWidth,
        showWeekends,
        scheduleStartHour,
        ticketSortMode,
      });
      await Promise.all([get().reloadEntries(), get().loadTasks(), get().loadTicketGroups()]);
    } catch (e) {
      set({ statusMessage: `初期化に失敗しました: ${String(e)}` });
    }
  },

  setView: (view) => set({ view }),

  setCalendarMode: async (mode) => {
    set({ calendarMode: mode, selectedEntryId: null, quickCreate: null });
    await get().reloadEntries();
  },

  setAnchorDate: async (date) => {
    set({ anchorDate: date, selectedEntryId: null, quickCreate: null });
    await get().reloadEntries();
  },

  showDay: async (date) => {
    set({ calendarMode: "day", anchorDate: date, selectedEntryId: null, quickCreate: null });
    await get().reloadEntries();
  },

  goToday: async () => get().setAnchorDate(new Date()),
  goNext: async () =>
    get().setAnchorDate(shiftAnchor(get().calendarMode, get().anchorDate, 1)),
  goPrev: async () =>
    get().setAnchorDate(shiftAnchor(get().calendarMode, get().anchorDate, -1)),

  reloadEntries: async () => {
    try {
      const { from, to } = calendarRange(
        get().calendarMode,
        get().anchorDate,
        get().weekStartsOn,
      );
      const entries = await entryRepo.listEntriesBetween(toLocalIso(from), toLocalIso(to));
      set({ entries });
    } catch (e) {
      set({ statusMessage: `記録の読み込みに失敗しました: ${String(e)}` });
    }
  },

  addEntry: async (input) => {
    try {
      const created = await entryRepo.createEntry(input);
      set((s) => ({ entries: sortByStart([...s.entries, created]), quickCreate: null }));
      if (created.taskId !== null) void get().loadTasks();
    } catch (e) {
      set({ statusMessage: `記録の作成に失敗しました: ${String(e)}` });
    }
  },

  modifyEntry: async (entry) => {
    try {
      const updated = await entryRepo.updateEntry(entry);
      set((s) => ({
        entries: sortByStart(s.entries.map((e) => (e.id === updated.id ? updated : e))),
        editor: null,
      }));
      void get().loadTasks();
    } catch (e) {
      set({ statusMessage: `記録の更新に失敗しました: ${String(e)}` });
    }
  },

  removeEntry: async (id) => {
    try {
      await entryRepo.deleteEntry(id);
      set((s) => ({
        entries: s.entries.filter((e) => e.id !== id),
        selectedEntryId: s.selectedEntryId === id ? null : s.selectedEntryId,
        editor: null,
      }));
      void get().loadTasks();
    } catch (e) {
      set({ statusMessage: `記録の削除に失敗しました: ${String(e)}` });
    }
  },

  addCategory: async (name, color) => {
    try {
      const created = await categoryRepo.createCategory(name, color);
      set((s) => ({ categories: [...s.categories, created] }));
    } catch (e) {
      set({ statusMessage: `カテゴリの作成に失敗しました: ${String(e)}` });
    }
  },

  updateCategory: async (category) => {
    try {
      await categoryRepo.updateCategory(category);
      set((s) => ({
        categories: s.categories.map((c) => (c.id === category.id ? category : c)),
      }));
    } catch (e) {
      set({ statusMessage: `カテゴリの更新に失敗しました: ${String(e)}` });
    }
  },

  archiveCategory: async (id) => {
    try {
      await categoryRepo.archiveCategory(id);
      set((s) => ({ categories: s.categories.filter((c) => c.id !== id) }));
    } catch (e) {
      set({ statusMessage: `カテゴリの削除に失敗しました: ${String(e)}` });
    }
  },

  toggleCategoryHidden: (id) =>
    set((s) => ({
      hiddenCategoryIds: s.hiddenCategoryIds.includes(id)
        ? s.hiddenCategoryIds.filter((x) => x !== id)
        : [...s.hiddenCategoryIds, id],
    })),

  loadTasks: async () => {
    try {
      const [tasks, taskActualMinutes, taskEntryRanges] = await Promise.all([
        taskRepo.listTasks(),
        taskRepo.actualMinutesByTask(),
        taskRepo.entryDateRangesByTask(),
      ]);
      set({ tasks, taskActualMinutes, taskEntryRanges });
    } catch (e) {
      set({ statusMessage: `タスクの読み込みに失敗しました: ${String(e)}` });
    }
  },

  addTask: async (title, categoryId, parentId = null, groupId = null, overrides = {}) => {
    try {
      const created = await taskRepo.createTask(title, categoryId, parentId, groupId, overrides);
      set((s) => ({ tasks: [...s.tasks, created] }));
      return created;
    } catch (e) {
      set({ statusMessage: `作成に失敗しました: ${String(e)}` });
      return null;
    }
  },

  updateTask: async (task) => {
    try {
      const updated = await taskRepo.updateTask(task);
      set((s) => ({ tasks: s.tasks.map((t) => (t.id === updated.id ? updated : t)) }));
    } catch (e) {
      set({ statusMessage: `タスクの更新に失敗しました: ${String(e)}` });
    }
  },

  toggleTaskDone: async (task) => {
    const done = task.status !== "done";
    await get().moveTaskStatus(task, done ? "done" : "todo");
  },

  moveTaskStatus: async (task, status) => {
    if (task.status === status) return;
    await get().updateTask({
      ...task,
      status,
      completedAt: status === "done" ? toLocalIso(new Date()) : null,
    });
  },

  removeTask: async (id) => {
    try {
      await taskRepo.deleteTask(id);
      set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
      await get().loadTasks();
    } catch (e) {
      set({ statusMessage: `タスクの削除に失敗しました: ${String(e)}` });
    }
  },

  setTasksViewMode: (mode) => set({ tasksViewMode: mode }),

  loadTicketGroups: async () => {
    try {
      const ticketGroups = await ticketGroupRepo.listTicketGroups();
      set({ ticketGroups });
    } catch (e) {
      set({ statusMessage: `分類の読み込みに失敗しました: ${String(e)}` });
    }
  },

  addTicketGroup: async (name) => {
    try {
      const created = await ticketGroupRepo.createTicketGroup(name);
      set((s) => ({ ticketGroups: [...s.ticketGroups, created] }));
      return created;
    } catch (e) {
      set({ statusMessage: `分類の作成に失敗しました: ${String(e)}` });
      return null;
    }
  },

  renameTicketGroup: async (id, name) => {
    try {
      await ticketGroupRepo.renameTicketGroup(id, name);
      set((s) => ({
        ticketGroups: s.ticketGroups.map((g) => (g.id === id ? { ...g, name } : g)),
      }));
    } catch (e) {
      set({ statusMessage: `分類の変更に失敗しました: ${String(e)}` });
    }
  },

  removeTicketGroup: async (id) => {
    try {
      await ticketGroupRepo.deleteTicketGroup(id);
      set((s) => ({
        ticketGroups: s.ticketGroups.filter((g) => g.id !== id),
        tasks: s.tasks.map((t) => (t.groupId === id ? { ...t, groupId: null } : t)),
      }));
    } catch (e) {
      set({ statusMessage: `分類の削除に失敗しました: ${String(e)}` });
    }
  },

  setGanttStartOffsetDays: async (days) => {
    const clamped = Math.max(0, Math.min(60, Math.round(days)));
    set({ ganttStartOffsetDays: clamped });
    try {
      await setSetting(SETTING_KEYS.ganttStartOffsetDays, String(clamped));
    } catch (e) {
      set({ statusMessage: `設定の保存に失敗しました: ${String(e)}` });
    }
  },

  setGanttMinLeftPaneWidth: async (px) => {
    const clamped = Math.max(60, Math.min(600, Math.round(px)));
    set({ ganttMinLeftPaneWidth: clamped });
    try {
      await setSetting(SETTING_KEYS.ganttMinLeftPaneWidth, String(clamped));
    } catch (e) {
      set({ statusMessage: `設定の保存に失敗しました: ${String(e)}` });
    }
  },

  setWeekStartsOn: async (value) => {
    set({ weekStartsOn: value });
    try {
      await setSetting(SETTING_KEYS.weekStartsOn, String(value));
    } catch (e) {
      set({ statusMessage: `設定の保存に失敗しました: ${String(e)}` });
    }
    await get().reloadEntries();
  },

  setShowWeekends: async (value) => {
    set({ showWeekends: value });
    try {
      await setSetting(SETTING_KEYS.showWeekends, value ? "1" : "0");
    } catch (e) {
      set({ statusMessage: `設定の保存に失敗しました: ${String(e)}` });
    }
  },

  setScheduleStartHour: async (hour) => {
    const clamped = Math.max(0, Math.min(23, Math.round(hour)));
    set({ scheduleStartHour: clamped });
    try {
      await setSetting(SETTING_KEYS.scheduleStartHour, String(clamped));
    } catch (e) {
      set({ statusMessage: `設定の保存に失敗しました: ${String(e)}` });
    }
  },

  setTicketSortMode: async (mode) => {
    set({ ticketSortMode: mode });
    try {
      await setSetting(SETTING_KEYS.ticketSortMode, mode);
    } catch (e) {
      set({ statusMessage: `設定の保存に失敗しました: ${String(e)}` });
    }
  },

  reorderTickets: async (idsInOrder) => {
    if (get().ticketSortMode !== "manual") await get().setTicketSortMode("manual");
    const orderIndex = new Map(idsInOrder.map((id, index) => [id, index]));
    set((s) => ({
      tasks: s.tasks.map((t) =>
        orderIndex.has(t.id) ? { ...t, sortOrder: orderIndex.get(t.id) ?? t.sortOrder } : t,
      ),
    }));
    try {
      await taskRepo.updateSortOrders(idsInOrder);
    } catch (e) {
      set({ statusMessage: `並び替えの保存に失敗しました: ${String(e)}` });
    }
  },

  toggleSidebar: () =>
    set((s) => ({
      sidebarPref: isSidebarVisible(s.sidebarPref, s.sidebarWidthOk) ? "hidden" : "shown",
    })),
  setSidebarWidthOk: (ok) => set({ sidebarWidthOk: ok }),

  setSearchKeyword: (keyword) => set({ searchKeyword: keyword }),
  setSearchBoxOpen: (open) => set({ searchBoxOpen: open }),

  jumpToEntry: async (entry) => {
    set({
      searchKeyword: "",
      view: "calendar",
      calendarMode: "week",
      anchorDate: fromLocalIso(entry.startAt),
      selectedEntryId: entry.id,
      quickCreate: null,
    });
    await get().reloadEntries();
  },

  selectEntry: (id) => set({ selectedEntryId: id }),
  openQuickCreate: (state) => set({ quickCreate: state, selectedEntryId: null }),
  closeQuickCreate: () => set({ quickCreate: null }),
  openEditor: (state) => set({ editor: state, quickCreate: null }),
  closeEditor: () => set({ editor: null }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setStatus: (message) => set({ statusMessage: message }),
}));
