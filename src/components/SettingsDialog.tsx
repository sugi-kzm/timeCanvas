import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/appStore";
import { confirmDialog } from "../store/confirmStore";
import { CATEGORY_PALETTE } from "../lib/colors";
import { entriesToCsv, entriesToJson } from "../lib/export";
import { listAllEntries } from "../db/entryRepo";
import { getSetting, setSetting, SETTING_KEYS } from "../db/settingsRepo";
import { detectOneDriveDir, runBackup } from "../db/backupService";
import { getNotesRoot, setNotesRoot } from "../db/notesService";
import { deleteSampleData, seedSampleData } from "../db/devSeed";
import { IconClose } from "./icons";

type Tab = "schedule" | "tickets" | "analytics" | "notes" | "history" | "data";

const TABS: { key: Tab; label: string }[] = [
  { key: "schedule", label: "スケジュール" },
  { key: "tickets", label: "チケット" },
  { key: "analytics", label: "分析" },
  { key: "notes", label: "ノート" },
  { key: "history", label: "履歴" },
  { key: "data", label: "データ" },
];

export function SettingsDialog() {
  const [tab, setTab] = useState<Tab>("schedule");
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);

  return (
    <div className="modal-backdrop" onPointerDown={() => setSettingsOpen(false)}>
      <div
        className="dialog settings-dialog"
        role="dialog"
        aria-label="設定"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h2 className="dialog-title">設定</h2>
          <button
            type="button"
            className="btn icon-btn"
            aria-label="閉じる"
            onClick={() => setSettingsOpen(false)}
          >
            <IconClose />
          </button>
        </div>
        <div className="tab-bar" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              className={`tab ${tab === t.key ? "active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "schedule" && <ScheduleTab />}
        {tab === "tickets" && <TicketsTab />}
        {tab === "analytics" && <PlaceholderTab />}
        {tab === "notes" && <NotesTab />}
        {tab === "history" && <PlaceholderTab />}
        {tab === "data" && <DataTab />}
      </div>
    </div>
  );
}

function PlaceholderTab() {
  return (
    <div className="settings-body">
      <p className="settings-hint">現在設定項目はありません。</p>
    </div>
  );
}

function ScheduleTab() {
  const weekStartsOn = useAppStore((s) => s.weekStartsOn);
  const setWeekStartsOn = useAppStore((s) => s.setWeekStartsOn);
  const showWeekends = useAppStore((s) => s.showWeekends);
  const setShowWeekends = useAppStore((s) => s.setShowWeekends);
  const scheduleStartHour = useAppStore((s) => s.scheduleStartHour);
  const setScheduleStartHour = useAppStore((s) => s.setScheduleStartHour);

  return (
    <div className="settings-body">
      <h3 className="settings-heading">カレンダー</h3>
      <div className="settings-row">
        <span className="settings-value">週の開始曜日</span>
        <select
          className="select-input settings-week-start"
          value={weekStartsOn}
          onChange={(e) => void setWeekStartsOn(e.target.value === "1" ? 1 : 0)}
        >
          <option value={0}>日曜日</option>
          <option value={1}>月曜日</option>
        </select>
      </div>
      <p className="settings-hint">
        週カレンダー・月カレンダー・ミニカレンダー・年間ヒートマップの並びに反映されます。
      </p>
      <div className="settings-row">
        <label className="settings-value settings-checkbox-label">
          <input
            type="checkbox"
            checked={showWeekends}
            onChange={(e) => void setShowWeekends(e.target.checked)}
          />
          週表示に土日を含める
        </label>
      </div>
      <div className="settings-row">
        <span className="settings-value">スケジュールの初期表示位置</span>
        <input
          type="number"
          className="text-input settings-gantt-offset"
          min={0}
          max={23}
          value={scheduleStartHour}
          onChange={(e) => void setScheduleStartHour(Number(e.target.value))}
        />
        <span className="settings-value-unit">時</span>
      </div>
    </div>
  );
}

function TicketsTab() {
  const categories = useAppStore((s) => s.categories);
  const addCategory = useAppStore((s) => s.addCategory);
  const updateCategory = useAppStore((s) => s.updateCategory);
  const archiveCategory = useAppStore((s) => s.archiveCategory);
  const ganttStartOffsetDays = useAppStore((s) => s.ganttStartOffsetDays);
  const setGanttStartOffsetDays = useAppStore((s) => s.setGanttStartOffsetDays);

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(CATEGORY_PALETTE[0]);

  const submitNew = () => {
    const name = newName.trim();
    if (name === "") return;
    void addCategory(name, newColor);
    setNewName("");
  };

  return (
    <div className="settings-body">
      <h3 className="settings-heading">カテゴリ</h3>
      <ul className="settings-category-list">
        {categories.map((c) => (
          <li key={c.id} className="settings-category-row">
            <input
              type="color"
              value={c.color}
              aria-label={`${c.name} の色`}
              onChange={(e) => void updateCategory({ ...c, color: e.target.value })}
            />
            <input
              type="text"
              className="text-input"
              defaultValue={c.name}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name !== "" && name !== c.name) void updateCategory({ ...c, name });
              }}
            />
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                void confirmDialog({
                  title: "カテゴリを削除",
                  message: `カテゴリ「${c.name}」を削除しますか？\n（このカテゴリの記録は「未分類」になります）`,
                  danger: true,
                }).then((ok) => {
                  if (ok) void archiveCategory(c.id);
                });
              }}
            >
              削除
            </button>
          </li>
        ))}
      </ul>
      <div className="settings-category-add">
        <input
          type="color"
          value={newColor}
          aria-label="新しいカテゴリの色"
          onChange={(e) => setNewColor(e.target.value)}
        />
        <input
          type="text"
          className="text-input"
          placeholder="新しいカテゴリ名"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) submitNew();
          }}
        />
        <button type="button" className="btn primary" onClick={submitNew}>
          追加
        </button>
      </div>
      <h3 className="settings-heading">ガントチャート</h3>
      <div className="settings-row">
        <span className="settings-value">開始位置：今日の</span>
        <input
          type="number"
          className="text-input settings-gantt-offset"
          min={0}
          max={60}
          value={ganttStartOffsetDays}
          onChange={(e) => void setGanttStartOffsetDays(Number(e.target.value))}
        />
        <span className="settings-value-unit">日前から表示</span>
      </div>
    </div>
  );
}

function NotesTab() {
  const setStatus = useAppStore((s) => s.setStatus);
  const [notesDir, setNotesDir] = useState<string | null>(null);

  useEffect(() => {
    void getNotesRoot().then(setNotesDir);
  }, []);

  const chooseDir = async () => {
    const dir = await open({ directory: true, title: "ノートの保存先フォルダを選択" });
    if (typeof dir !== "string") return;
    await setNotesRoot(dir);
    setNotesDir(dir);
    setStatus(`ノートの保存先を変更しました: ${dir}`);
  };

  return (
    <div className="settings-body">
      <h3 className="settings-heading">保存先フォルダ</h3>
      <div className="settings-row">
        <span className="settings-value">{notesDir ?? "読み込み中…"}</span>
        <button type="button" className="btn" onClick={() => void chooseDir()}>
          フォルダを選択
        </button>
      </div>
      <p className="settings-hint">
        変更するとアプリの再起動なしで、次回ノート画面を開いたときに新しい保存先が使われます。
      </p>
    </div>
  );
}

function DataTab() {
  const setStatus = useAppStore((s) => s.setStatus);
  const categories = useAppStore((s) => s.categories);
  const reloadEntries = useAppStore((s) => s.reloadEntries);
  const loadTasks = useAppStore((s) => s.loadTasks);
  const [backupDir, setBackupDir] = useState<string | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [oneDrive, setOneDrive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [seedingBusy, setSeedingBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      setBackupDir(await getSetting(SETTING_KEYS.backupDir));
      setLastBackupAt(await getSetting(SETTING_KEYS.lastBackupAt));
      setOneDrive(await detectOneDriveDir().catch(() => null));
    })();
  }, []);

  const chooseDir = async () => {
    const dir = await open({ directory: true, title: "バックアップ先フォルダを選択" });
    if (typeof dir === "string") {
      await setSetting(SETTING_KEYS.backupDir, dir);
      setBackupDir(dir);
    }
  };

  const useOneDrive = async () => {
    if (oneDrive === null) return;
    const sep = oneDrive.includes("\\") ? "\\" : "/";
    const dir = `${oneDrive}${sep}TimeCanvasBackups`;
    try {
      await invoke("ensure_dir", { path: dir });
      await setSetting(SETTING_KEYS.backupDir, dir);
      setBackupDir(dir);
      setStatus(`バックアップ先を設定しました: ${dir}`);
    } catch (e) {
      setStatus(`フォルダの作成に失敗しました: ${String(e)}`);
    }
  };

  const backupNow = async () => {
    setBusy(true);
    try {
      const result = await runBackup();
      setStatus(result.message);
      setLastBackupAt(await getSetting(SETTING_KEYS.lastBackupAt));
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async () => {
    const path = await open({
      title: "復元するバックアップファイルを選択",
      filters: [{ name: "TimeCanvas バックアップ", extensions: ["db"] }],
    });
    if (typeof path !== "string") return;
    const ok = await confirmDialog({
      title: "バックアップから復元",
      message:
        "現在のデータを、選択したバックアップの内容で置き換えます。よろしいですか？\n" +
        "（現在のデータは timecanvas-pre-restore-*.db としてデータフォルダに残ります。\n" +
        "続行するとアプリが再起動します）",
      confirmLabel: "復元する",
      danger: true,
    });
    if (!ok) return;
    try {
      await invoke("stage_restore", { src: path });
      await relaunch();
    } catch (e) {
      setStatus(`復元の準備に失敗しました: ${String(e)}`);
    }
  };

  const exportData = async (format: "json" | "csv") => {
    const path = await save({
      title: "エクスポート先を選択",
      defaultPath: `timecanvas-export.${format}`,
      filters: [
        format === "json"
          ? { name: "JSON", extensions: ["json"] }
          : { name: "CSV", extensions: ["csv"] },
      ],
    });
    if (path === null) return;
    try {
      const entries = await listAllEntries();
      const contents =
        format === "json" ? entriesToJson(entries, categories) : entriesToCsv(entries, categories);
      await invoke("write_text_file", { path, contents });
      setStatus(`エクスポートしました: ${path}`);
    } catch (e) {
      setStatus(`エクスポートに失敗しました: ${String(e)}`);
    }
  };

  const checkForUpdate = async () => {
    setCheckingUpdate(true);
    setStatus("確認中...");
    try {
      const update = await check();
      if (update === null) {
        setAvailableUpdate(null);
        setStatus("最新版です");
      } else {
        setAvailableUpdate(update);
        setStatus(`新しいバージョンがあります: ${update.version}`);
      }
    } catch (e) {
      setAvailableUpdate(null);
      setStatus(`アップデートの確認に失敗しました: ${String(e)}`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const installUpdate = async () => {
    if (availableUpdate === null) return;
    setInstallingUpdate(true);
    setStatus("ダウンロード中...");
    try {
      let lastPercent = -1;
      let totalLength = 0;
      let downloaded = 0;
      await availableUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") {
          totalLength = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (totalLength > 0) {
            const percent = Math.floor((downloaded / totalLength) * 100);
            if (percent !== lastPercent) {
              lastPercent = percent;
              setStatus(`ダウンロード中... ${percent}%`);
            }
          }
        } else if (event.event === "Finished") {
          setStatus("インストール中...");
        }
      });
      setStatus("更新が完了しました。再起動します...");
      await relaunch();
    } catch (e) {
      setStatus(`アップデートに失敗しました: ${String(e)}`);
    } finally {
      setInstallingUpdate(false);
    }
  };

  const seedSample = async () => {
    setSeedingBusy(true);
    try {
      await seedSampleData();
      await Promise.all([reloadEntries(), loadTasks()]);
      setStatus("サンプルデータを投入しました");
    } catch (e) {
      setStatus(`サンプルデータの投入に失敗しました: ${String(e)}`);
    } finally {
      setSeedingBusy(false);
    }
  };

  const deleteSample = async () => {
    const ok = await confirmDialog({
      title: "サンプルデータを削除",
      message: "「[sample]」で始まるチケット・記録をすべて削除します。よろしいですか？",
      danger: true,
    });
    if (!ok) return;
    setSeedingBusy(true);
    try {
      await deleteSampleData();
      await Promise.all([reloadEntries(), loadTasks()]);
      setStatus("サンプルデータを削除しました");
    } catch (e) {
      setStatus(`サンプルデータの削除に失敗しました: ${String(e)}`);
    } finally {
      setSeedingBusy(false);
    }
  };

  return (
    <div className="settings-body">
      <h3 className="settings-heading">アップデート</h3>
      <div className="settings-row">
        <span className="settings-value">
          {availableUpdate !== null
            ? `新しいバージョン ${availableUpdate.version} が利用可能です`
            : "現在のバージョンを確認します"}
        </span>
        <button
          type="button"
          className="btn"
          disabled={checkingUpdate || installingUpdate}
          onClick={() => void checkForUpdate()}
        >
          アップデートを確認
        </button>
        {availableUpdate !== null && (
          <button
            type="button"
            className="btn primary"
            disabled={installingUpdate}
            onClick={() => void installUpdate()}
          >
            今すぐ更新
          </button>
        )}
      </div>
      {availableUpdate?.body != null && availableUpdate.body !== "" && (
        <p className="settings-hint">{availableUpdate.body}</p>
      )}
      <h3 className="settings-heading">バックアップ</h3>
      <p className="settings-desc">
        アプリ終了時と 1 日 1 回、指定フォルダへ自動バックアップします（直近 30 世代を保持）。
        OneDrive 配下のフォルダを指定すると PC 交換時に記録を引き継げます。
      </p>
      <div className="settings-row">
        <span className="settings-value">{backupDir ?? "未設定"}</span>
        <button type="button" className="btn" onClick={() => void chooseDir()}>
          フォルダを選択
        </button>
        {oneDrive !== null && backupDir === null && (
          <button type="button" className="btn" onClick={() => void useOneDrive()}>
            OneDrive を使う
          </button>
        )}
      </div>
      <div className="settings-row">
        <span className="settings-value">
          最終バックアップ: {lastBackupAt !== null ? lastBackupAt.replace("T", " ") : "未実行"}
        </span>
        <button type="button" className="btn" disabled={busy} onClick={() => void backupNow()}>
          今すぐバックアップ
        </button>
      </div>
      <h3 className="settings-heading">復元</h3>
      <div className="settings-row">
        <span className="settings-value">
          バックアップファイル（timecanvas-backup-*.db）からデータを復元します
        </span>
        <button type="button" className="btn" onClick={() => void restoreBackup()}>
          バックアップから復元…
        </button>
      </div>
      <p className="settings-hint">
        新しい PC への引き継ぎ：アプリをインストール後、この画面から OneDrive
        内のバックアップファイルを選ぶだけで記録を引き継げます。復元時にアプリは再起動します。
      </p>
      <h3 className="settings-heading">エクスポート</h3>
      <div className="settings-row">
        <button type="button" className="btn" onClick={() => void exportData("json")}>
          JSON でエクスポート
        </button>
        <button type="button" className="btn" onClick={() => void exportData("csv")}>
          CSV でエクスポート
        </button>
      </div>
      {import.meta.env.DEV && (
        <>
          <h3 className="settings-heading">開発用サンプルデータ</h3>
          <p className="settings-hint">
            開発ビルドのみに表示されます。チケット・記録のサンプルを投入し、履歴・ガント・カンバン・分析の表示確認に使えます。
          </p>
          <div className="settings-row">
            <button type="button" className="btn" disabled={seedingBusy} onClick={() => void seedSample()}>
              サンプルデータを投入
            </button>
            <button
              type="button"
              className="btn danger"
              disabled={seedingBusy}
              onClick={() => void deleteSample()}
            >
              サンプルデータを削除
            </button>
          </div>
        </>
      )}
    </div>
  );
}
