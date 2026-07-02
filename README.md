# TimeCanvas

自分だけが見られる、完全ローカルの時間記録デスクトップアプリ。
Outlook カレンダーの操作感で「何を何時間やったのか」を記録し、振り返るための Windows アプリです。

- **プライバシー第一**: データは端末内の SQLite にのみ保存。外部ネットワーク通信なし
- **Outlook 風の週カレンダー**: ドラッグで記録を作成、移動・伸縮も直感的に
- **PC 交換に強い**: OneDrive 等のフォルダへ自動バックアップ（終了時 + 日次、30 世代保持）

ドキュメント:

- [要件定義書](docs/requirements.md)
- [画面設計書](docs/ui-design.md)

## 技術スタック

| レイヤ | 技術 |
|--------|------|
| アプリ基盤 | Tauri 2.x |
| フロントエンド | React 19 + TypeScript + Vite |
| 状態管理 | Zustand |
| DB | SQLite（tauri-plugin-sql、WAL モード） |
| テスト | Vitest（TS）/ cargo test（Rust） |

## 開発

```bash
# 依存関係のインストール
npm install

# 開発起動（Vite + Tauri ウィンドウ）
npm run tauri dev

# フロントエンドのユニットテスト
npm test
npm run coverage   # カバレッジ付き（lib/ は 80% 以上を維持）

# 型チェック + プロダクションビルド
npm run build

# Rust 側
cd src-tauri
cargo fmt && cargo clippy && cargo test
```

### Windows 向けパッケージング

リリースビルド（`.msi` / `.exe`）は Windows 側の Rust ツールチェーン
（MSVC）で `npm run tauri build` を実行する。WSL 上では Linux 向けの
開発・テストのみ行う。

## プロジェクト構成

```
src/
├── components/        # React コンポーネント
│   ├── calendar/      # 週カレンダー（グリッド、エントリ、作成/編集 UI）
│   └── sidebar/       # ミニカレンダー、カテゴリ、週サマリー
├── db/                # SQLite リポジトリ層・バックアップ
├── lib/               # 純粋ロジック（日時、レイアウト、集計、エクスポート）
├── store/             # Zustand ストア
└── types.ts           # 共有型定義

src-tauri/
├── src/lib.rs         # Tauri 初期化・DB マイグレーション定義
└── src/backup.rs      # バックアップ関連コマンド（世代管理、OneDrive 検出等）
```

## フェーズ計画

| フェーズ | 内容 | 状態 |
|---------|------|------|
| Phase 1 | 時間記録（日/週/月カレンダー）、バックアップ・復元、エクスポート | 実装済み |
| Phase 2 | タスク管理（TODO・見積⇔実績）、エントリ検索（Ctrl+F） | 実装済み |
| Phase 3 | 分析（カテゴリ別集計、見積 vs 実績、年間ヒートマップ） | 実装済み |
| Phase 4 | ノート（Markdown ナレッジベース、全文検索） | 実装済み |
