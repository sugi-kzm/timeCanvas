import { useEffect, useRef } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { isSidebarVisible, useAppStore } from "./store/appStore";
import { NavRail } from "./components/NavRail";
import { Toolbar } from "./components/Toolbar";
import { Sidebar } from "./components/sidebar/Sidebar";
import { WeekView } from "./components/calendar/WeekView";
import { DayView } from "./components/calendar/DayView";
import { MonthView } from "./components/calendar/MonthView";
import { TasksView } from "./components/tasks/TasksView";
import { HistoryView } from "./components/history/HistoryView";
import { SearchView } from "./components/search/SearchView";
import { AnalyticsView } from "./components/analytics/AnalyticsView";
import { NotesView } from "./components/notes/NotesView";
import { QuickCreatePopover } from "./components/calendar/QuickCreatePopover";
import { EntryDialog } from "./components/calendar/EntryDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { runBackup, runDailyBackupIfDue } from "./db/backupService";

const DAILY_BACKUP_CHECK_MS = 30 * 60 * 1000;
/** サイドバー幅(216px) + スケジュール最小幅(827px) を下回ったらサイドバーを自動的に隠す */
const SIDEBAR_AUTOHIDE_THRESHOLD_PX = 216 + 827;
/** 日表示に切り替えたときの横幅（11時間表示・tauri.conf.json の minWidth: 720 より少し余裕を持たせる） */
const DAY_VIEW_WINDOW_WIDTH = 760;
/** 日表示のコンパクト高さ（ツールバー + 時刻行 + トラック + 余白） */
const DAY_VIEW_WINDOW_HEIGHT = 320;
/** 日表示中はさらに小さくもできる（ユーザーの手動リサイズを妨げない） */
const DAY_VIEW_MIN_SIZE = new LogicalSize(480, 240);
/** 通常時の最小サイズ（tauri.conf.json の minWidth/minHeight と同値に保つ） */
const DEFAULT_MIN_SIZE = new LogicalSize(480, 320);

let lifecycleRegistered = false;

export default function App() {
  const init = useAppStore((s) => s.init);
  const view = useAppStore((s) => s.view);
  const calendarMode = useAppStore((s) => s.calendarMode);
  const searchActive = useAppStore((s) => s.searchKeyword.trim() !== "");
  const quickCreate = useAppStore((s) => s.quickCreate);
  const editor = useAppStore((s) => s.editor);
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const statusMessage = useAppStore((s) => s.statusMessage);
  const setStatus = useAppStore((s) => s.setStatus);
  const sidebarPref = useAppStore((s) => s.sidebarPref);
  const sidebarWidthOk = useAppStore((s) => s.sidebarWidthOk);
  const setSidebarWidthOk = useAppStore((s) => s.setSidebarWidthOk);

  const appBodyRef = useRef<HTMLDivElement>(null);
  const sidebarVisible = isSidebarVisible(sidebarPref, sidebarWidthOk);
  const preDayViewSizeRef = useRef<LogicalSize | null>(null);
  /** 日表示中にユーザーが手動リサイズしたサイズ。次回の日表示で再利用する */
  const lastDayViewSizeRef = useRef<LogicalSize | null>(null);
  /** 日表示リサイズの世代トークン。素早い切替時に古い async 処理が後から効かないようにする */
  const resizeSeqRef = useRef(0);

  useEffect(() => {
    void init();
  }, [init]);

  // 日表示に入るときはウィンドウ自体をコンパクトな最小サイズまで縮め、離れたら元のサイズに戻す
  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    const isDayView = view === "calendar" && calendarMode === "day";

    const seq = ++resizeSeqRef.current;
    const isStale = () => seq !== resizeSeqRef.current;

    if (isDayView) {
      void (async () => {
        try {
          if (preDayViewSizeRef.current === null) {
            const factor = await win.scaleFactor();
            const current = (await win.innerSize()).toLogical(factor);
            if (isStale()) return;
            preDayViewSizeRef.current = current;
          }
          // 日表示中はさらに小さくできるよう最小サイズ制約を緩める
          if (isStale()) return;
          await win.setMinSize(DAY_VIEW_MIN_SIZE);
          if (isStale()) return;
          // 前回の日表示で手動リサイズしたサイズがあればそれを尊重する
          await win.setSize(
            lastDayViewSizeRef.current ??
              new LogicalSize(DAY_VIEW_WINDOW_WIDTH, DAY_VIEW_WINDOW_HEIGHT),
          );
        } catch (err) {
          console.error("day view のウィンドウリサイズに失敗しました", err);
        }
      })();
    } else {
      const previous = preDayViewSizeRef.current;
      if (previous !== null) {
        preDayViewSizeRef.current = null;
        void (async () => {
          try {
            // 日表示中に手動リサイズしていたら次回のために記憶する
            const factor = await win.scaleFactor();
            const current = (await win.innerSize()).toLogical(factor);
            if (isStale()) return;
            lastDayViewSizeRef.current = current;
            await win.setMinSize(DEFAULT_MIN_SIZE);
            if (isStale()) return;
            await win.setSize(previous);
          } catch (err) {
            console.error("ウィンドウサイズの復元に失敗しました", err);
          }
        })();
      }
    }
  }, [view, calendarMode]);

  // 幅が足りないときはサイドバーを自動的に隠す（auto のときのみ有効。手動指定が優先）。
  // .app-body はカレンダー以外の画面で unmount されるため、view の変化で監視を張り直す
  useEffect(() => {
    const el = appBodyRef.current;
    if (el === null) return;
    const update = () => setSidebarWidthOk(el.clientWidth >= SIDEBAR_AUTOHIDE_THRESHOLD_PX);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [view, setSidebarWidthOk]);

  // 終了時バックアップと日次バックアップ（アプリ全体で一度だけ登録）
  useEffect(() => {
    if (lifecycleRegistered) return;
    if (!isTauri()) return;
    lifecycleRegistered = true;

    const win = getCurrentWindow();
    let closing = false;
    void win.onCloseRequested(async (event) => {
      if (closing) return;
      event.preventDefault();
      closing = true;
      try {
        await runBackup();
      } finally {
        await win.destroy();
      }
    });

    void runDailyBackupIfDue();
    setInterval(() => void runDailyBackupIfDue(), DAILY_BACKUP_CHECK_MS);
  }, []);

  // ステータストーストの自動消去
  useEffect(() => {
    if (statusMessage === null) return;
    const timer = setTimeout(() => setStatus(null), 6000);
    return () => clearTimeout(timer);
  }, [statusMessage, setStatus]);

  // Ctrl+F で検索ボックスを開いてフォーカス
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        const state = useAppStore.getState();
        state.setView("calendar");
        state.setSearchBoxOpen(true);
        setTimeout(() => document.getElementById("entry-search-input")?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="app">
      <NavRail />
      <div className="app-main">
        {view === "calendar" ? (
          <>
            <Toolbar />
            <div className="app-body" ref={appBodyRef}>
              {sidebarVisible && <Sidebar />}
              {searchActive ? (
                <SearchView />
              ) : calendarMode === "month" ? (
                <MonthView />
              ) : calendarMode === "day" ? (
                <DayView />
              ) : (
                <WeekView />
              )}
            </div>
          </>
        ) : view === "tasks" ? (
          <TasksView />
        ) : view === "history" ? (
          <HistoryView />
        ) : view === "analytics" ? (
          <AnalyticsView />
        ) : (
          <NotesView />
        )}
      </div>
      {quickCreate !== null && <QuickCreatePopover />}
      {editor !== null && <EntryDialog />}
      {settingsOpen && <SettingsDialog />}
      <ConfirmDialog />
      {statusMessage !== null && (
        <div className="toast" role="status">
          {statusMessage}
        </div>
      )}
    </div>
  );
}
