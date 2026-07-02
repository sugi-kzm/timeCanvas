import { create } from "zustand";
import type { CalendarMode, Category, NewEntryInput, TimeEntry, ViewKind } from "../types";
import { calendarRange, shiftAnchor, toLocalIso } from "../lib/dates";
import * as categoryRepo from "../db/categoryRepo";
import * as entryRepo from "../db/entryRepo";

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
    }
  | { mode: "edit"; entry: TimeEntry };

interface AppState {
  view: ViewKind;
  calendarMode: CalendarMode;
  /** 表示の基準日。週表示は含まれる週、月表示は含まれる月を表示する */
  anchorDate: Date;
  entries: TimeEntry[];
  categories: Category[];
  hiddenCategoryIds: readonly string[];
  selectedEntryId: string | null;
  quickCreate: QuickCreateState | null;
  editor: EditorState | null;
  settingsOpen: boolean;
  statusMessage: string | null;

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
  hiddenCategoryIds: [],
  selectedEntryId: null,
  quickCreate: null,
  editor: null,
  settingsOpen: false,
  statusMessage: null,

  init: async () => {
    try {
      await categoryRepo.ensureDefaultCategories();
      const categories = await categoryRepo.listCategories();
      set({ categories });
      await get().reloadEntries();
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
      const { from, to } = calendarRange(get().calendarMode, get().anchorDate);
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

  selectEntry: (id) => set({ selectedEntryId: id }),
  openQuickCreate: (state) => set({ quickCreate: state, selectedEntryId: null }),
  closeQuickCreate: () => set({ quickCreate: null }),
  openEditor: (state) => set({ editor: state, quickCreate: null }),
  closeEditor: () => set({ editor: null }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setStatus: (message) => set({ statusMessage: message }),
}));
