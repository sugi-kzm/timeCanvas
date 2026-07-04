# リリース手順（GitHub Actions）

TimeCanvas の Windows ネイティブビルドと配布は GitHub Actions で自動化する。
TeraTerm 等と同じく、**GitHub の Releases ページから `.msi` / `.exe` をダウンロードして
インストールする**形を目指す。

## 前提

- リポジトリは GitHub 上に作成し、このコードを push しておく
- Windows 用の Runner は GitHub がホストする `windows-latest`（無料枠内で利用可能）を使う。
  セルフホスト Runner は現時点では不要

## ワークフロー構成

| ファイル | トリガー | 内容 |
|---------|---------|------|
| `.github/workflows/ci.yml` | 全ブランチへの push・main への PR | フロントエンド（build + vitest）と Rust（fmt/clippy/test）を Linux 上で検証。速く・無料 |
| `.github/workflows/release.yml` | `v*.*.*` 形式のタグ push（例 `v0.2.0`） | Windows 上でネイティブビルドし、**Draft の GitHub Release** を作成して `.msi`/`.exe` を添付 |

`release.yml` は `workflow_dispatch`（Actions タブからの手動実行）にも対応しており、
その場合は Release を作らずビルド確認のみ行い、成果物を Actions のアーティファクトとして
14日間保持する（タグを切る前に「ちゃんとビルドできるか」を確認したいときに使う）。

## リリースの切り方

1. `package.json` の `"version"` と `src-tauri/tauri.conf.json` の `"version"` を
   同じ値に更新する（例: `0.2.0`）。コミットして `main` に push する
2. 同じバージョンでタグを作成して push する：
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
3. GitHub Actions の `release.yml` が自動実行され、`.msi` と `.exe`（NSIS インストーラー）を
   添付した **Draft** の Release が作成される
4. GitHub の Releases ページで内容を確認し、必要ならリリースノートを編集して
   「Publish release」を押すと公開される（Draft のままなら一般には見えない）

タグのバージョンと `package.json` の `version` が一致しない場合、ワークフローは
早期にエラーで止まる（バージョンの更新忘れを防止するため）。

## 利用者側のインストール手順（想定）

1. GitHub の Releases ページを開く
2. 最新版の `.msi`（または `.exe`）をダウンロード
3. 実行してインストールウィザードに従う

## 今後の検討事項

- コード署名（Authenticode）証明書を用意すれば、SmartScreen の警告を減らせる。
  現状は署名なしのため、初回起動時に Windows Defender SmartScreen の警告が出ることがある
- 自動アップデート機能（`tauri-plugin-updater`）を使う場合は署名鍵の管理が必要になる。
  Phase 1 の要件（自動アップデートなし）に沿って、現時点では見送り
