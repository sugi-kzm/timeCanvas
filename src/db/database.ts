import Database from "@tauri-apps/plugin-sql";

export const DB_URL = "sqlite:timecanvas.db";

let dbPromise: Promise<Database> | null = null;

/** DB 接続のシングルトン。初回接続時に WAL モードを有効化する */
export function getDb(): Promise<Database> {
  if (dbPromise === null) {
    dbPromise = Database.load(DB_URL).then(async (db) => {
      await db.execute("PRAGMA journal_mode=WAL;");
      return db;
    });
    dbPromise.catch(() => {
      // 失敗した Promise をキャッシュしない（次回リトライ可能にする）
      dbPromise = null;
    });
  }
  return dbPromise;
}
