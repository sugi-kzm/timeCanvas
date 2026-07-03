import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/appStore";
import { CATEGORY_PALETTE } from "../lib/colors";
import { entriesToCsv, entriesToJson } from "../lib/export";
import { listAllEntries } from "../db/entryRepo";
import { getSetting, setSetting, SETTING_KEYS } from "../db/settingsRepo";
import { detectOneDriveDir, runBackup } from "../db/backupService";
import { IconClose } from "./icons";

type Tab = "categories" | "display" | "data";

export function SettingsDialog() {
  const [tab, setTab] = useState<Tab>("categories");
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
          <button
            type="button"
            role="tab"
            className={`tab ${tab === "categories" ? "active" : ""}`}
            onClick={() => setTab("categories")}
          >
            カテゴリ
          </button>
          <button
            type="button"
            role="tab"
            className={`tab ${tab === "display" ? "active" : ""}`}
            onClick={() => setTab("display")}
          >
            表示
          </button>
          <button
            type="button"
            role="tab"
            className={`tab ${tab === "data" ? "active" : ""}`}
            onClick={() => setTab("data")}
          >
            データ
          </button>
        </div>
        {tab === "categories" && <CategoriesTab />}
        {tab === "display" && <DisplayTab />}
        {tab === "data" && <DataTab />}
      </div>
    </div>
  );
}

function CategoriesTab() {
  const categories = useAppStore((s) => s.categories);
  const addCategory = useAppStore((s) => s.addCategory);
  const updateCategory = useAppStore((s) => s.updateCategory);
  const archiveCategory = useAppStore((s) => s.archiveCategory);

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
                if (
                  window.confirm(
                    `カテゴリ「${c.name}」を削除しますか？\n（このカテゴリの記録は「未分類」になります）`,
                  )
                ) {
                  void archiveCategory(c.id);
                }
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
            if (e.key === "Enter") submitNew();
          }}
        />
        <button type="button" className="btn primary" onClick={submitNew}>
          追加
        </button>
      </div>
    </div>
  );
}

function DisplayTab() {
  const weekStartsOn = useAppStore((s) => s.weekStartsOn);
  const setWeekStartsOn = useAppStore((s) => s.setWeekStartsOn);
  const ganttStartOffsetDays = useAppStore((s) => s.ganttStartOffsetDays);
  const setGanttStartOffsetDays = useAppStore((s) => s.setGanttStartOffsetDays);

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

function DataTab() {
  const setStatus = useAppStore((s) => s.setStatus);
  const categories = useAppStore((s) => s.categories);
  const [backupDir, setBackupDir] = useState<string | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [oneDrive, setOneDrive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    const ok = window.confirm(
      "現在のデータを、選択したバックアップの内容で置き換えます。よろしいですか？\n" +
        "（現在のデータは timecanvas-pre-restore-*.db としてデータフォルダに残ります。\n" +
        "続行するとアプリが再起動します）",
    );
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

  return (
    <div className="settings-body">
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
    </div>
  );
}
