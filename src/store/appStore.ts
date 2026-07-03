import { create } from "zustand";
import type {
  CalendarMode,
  Category,
  NewEntryInput,
  Task,
  TaskStatus,
  TimeEntry,
  ViewKind,
} from "../types";
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

export type TasksViewMode = "board" | "gantt";

interface AppState {
  view: ViewKind;
  calendarMode: CalendarMode;
  /** 表示の基準日。週表示は含まれる週、月表示は含まれる月を表示する */
  anchorDate: Date;
  entries: TimeEntry[];
  categories: Category[];
  tasks: Task[];
  /** タスクID → 実績合計（分） */
  taskActualMinutes: ReadonlyMap<string, number>;
  /** タスクID → 実績の期間（開始日〜最終日）。ガントで日付未設定時の表示に使う */
  taskEntryRanges: ReadonlyMap<string, taskRepo.EntryDateRange>;
  /** チケット画面の表示モード（カンバン / ガント） */
  tasksViewMode: TasksViewMode;
  /** 週の開始曜日（0=日曜, 1=月曜）。設定から変更できる */
  weekStartsOn: WeekStartsOn;
  hiddenCategoryIds: readonly string[];
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
  ) => Promise<void>;
  updateTask: (task: Task) => Promise<void>;
  toggleTaskDone: (task: Task) => Promise<void>;
  moveTaskStatus: (task: Task, status: TaskStatus) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  setTasksViewMode: (mode: TasksViewMode) => void;
  setWeekStartsOn: (value: WeekStartsOn) => Promise<void>;

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
  taskActualMinutes: new Map(),
  taskEntryRanges: new Map(),
  tasksViewMode: "board",
  weekStartsOn: 0,
  hiddenCategoryIds: [],
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
      set({ categories, weekStartsOn });
      await Promise.all([get().reloadEntries(), get().loadTasks()]);
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

  addTask: async (title, categoryId, parentId = null) => {
    try {
      const created = await taskRepo.createTask(title, categoryId, parentId);
      set((s) => ({ tasks: [...s.tasks, created] }));
    } catch (e) {
      set({ statusMessage: `作成に失敗しました: ${String(e)}` });
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

  setWeekStartsOn: async (value) => {
    set({ weekStartsOn: value });
    try {
      await setSetting(SETTING_KEYS.weekStartsOn, String(value));
    } catch (e) {
      set({ statusMessage: `設定の保存に失敗しました: ${String(e)}` });
    }
    await get().reloadEntries();
  },

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
