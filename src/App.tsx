import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "./store/appStore";
import { NavRail } from "./components/NavRail";
import { Toolbar } from "./components/Toolbar";
import { Sidebar } from "./components/sidebar/Sidebar";
import { WeekView } from "./components/calendar/WeekView";
import { QuickCreatePopover } from "./components/calendar/QuickCreatePopover";
import { EntryDialog } from "./components/calendar/EntryDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { runBackup, runDailyBackupIfDue } from "./db/backupService";

const DAILY_BACKUP_CHECK_MS = 30 * 60 * 1000;

let lifecycleRegistered = false;

export default function App() {
  const init = useAppStore((s) => s.init);
  const view = useAppStore((s) => s.view);
  const quickCreate = useAppStore((s) => s.quickCreate);
  const editor = useAppStore((s) => s.editor);
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const statusMessage = useAppStore((s) => s.statusMessage);
  const setStatus = useAppStore((s) => s.setStatus);

  useEffect(() => {
    void init();
  }, [init]);

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

  return (
    <div className="app">
      <NavRail />
      <div className="app-main">
        {view === "calendar" ? (
          <>
            <Toolbar />
            <div className="app-body">
              <Sidebar />
              <WeekView />
            </div>
          </>
        ) : (
          <div className="placeholder-view">
            <p>この画面は今後のフェーズで実装予定です</p>
          </div>
        )}
      </div>
      {quickCreate !== null && <QuickCreatePopover />}
      {editor !== null && <EntryDialog />}
      {settingsOpen && <SettingsDialog />}
      {statusMessage !== null && (
        <div className="toast" role="status">
          {statusMessage}
        </div>
      )}
    </div>
  );
}
