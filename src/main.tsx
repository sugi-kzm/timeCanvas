import React from "react";
import ReactDOM from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import App from "./App";
import "./styles.css";

/** ブラウザで直接開かれた場合は DB にアクセスできないため案内を出す */
function BrowserNotice() {
  return (
    <div className="browser-notice">
      <h1>TimeCanvas</h1>
      <p>
        この画面はブラウザで開かれているため、データベースに接続できません。
        <br />
        <code>npm run tauri dev</code> で起動した
        <strong>デスクトップアプリのウィンドウ</strong>からご利用ください。
      </p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isTauri() ? <App /> : <BrowserNotice />}</React.StrictMode>,
);
