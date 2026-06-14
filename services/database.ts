import { Platform } from 'react-native';
import { DownloadItem, LibraryItem } from '@/types';

type AnyDB = {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: unknown[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>;
};

let db: AnyDB | null = null;
let dbPromise: Promise<AnyDB | null> | null = null;
let dbInitializationError: Error | null = null;
const CURRENT_SCHEMA_VERSION = 2;

function toDatabaseError(error: unknown): Error {
  return error instanceof Error ? error : new Error('SQLite database initialization failed.');
}

function requireDatabase(database: AnyDB | null): AnyDB {
  if (database) return database;
  throw dbInitializationError ?? new Error('SQLite database is unavailable.');
}

async function getSchemaVersion(database: AnyDB): Promise<number> {
  const rows = await database.getAllAsync<{ version: number }>(
    'SELECT version FROM schema_version WHERE id = 1 LIMIT 1'
  );
  if (rows.length === 0) return 0;
  const version = Number(rows[0].version);
  return Number.isFinite(version) ? version : 0;
}

async function setSchemaVersion(database: AnyDB, version: number): Promise<void> {
  await database.runAsync(
    `INSERT OR REPLACE INTO schema_version (id, version) VALUES (1, ?)`,
    [version]
  );
}

async function migrateToV1(database: AnyDB): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY,
      videoId TEXT NOT NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      thumbnail TEXT NOT NULL,
      format TEXT NOT NULL,
      filePath TEXT NOT NULL,
      fileSize INTEGER DEFAULT 0,
      downloadedBytes INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      progress REAL DEFAULT 0,
      timestamp INTEGER NOT NULL,
      errorMessage TEXT
    );

    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      videoId TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      thumbnail TEXT NOT NULL,
      lengthSeconds INTEGER DEFAULT 0,
      watchedAt INTEGER NOT NULL,
      watchProgress REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS liked (
      id TEXT PRIMARY KEY,
      videoId TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      thumbnail TEXT NOT NULL,
      lengthSeconds INTEGER DEFAULT 0,
      watchedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL UNIQUE,
      timestamp INTEGER NOT NULL
    );
  `);
}

async function migrateToV2(database: AnyDB): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS saved (
      id TEXT PRIMARY KEY,
      videoId TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      thumbnail TEXT NOT NULL,
      lengthSeconds INTEGER DEFAULT 0,
      watchedAt INTEGER NOT NULL
    );
  `);
}

export async function runMigrations(database: AnyDB): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL
    );
  `);

  let version = await getSchemaVersion(database);
  while (version < CURRENT_SCHEMA_VERSION) {
    const nextVersion = version + 1;
    // Wrap each migration in a transaction so a crash mid-migration leaves the DB in a
    // consistent state (rolled back) rather than partially mutated. The schema_version row
    // only commits if the migration body succeeds end-to-end.
    await database.execAsync('BEGIN IMMEDIATE TRANSACTION;');
    try {
      if (nextVersion === 1) {
        await migrateToV1(database);
      } else if (nextVersion === 2) {
        await migrateToV2(database);
      } else {
        throw new Error(`Unknown schema migration target: ${nextVersion}`);
      }
      await setSchemaVersion(database, nextVersion);
      await database.execAsync('COMMIT;');
    } catch (error) {
      await database.execAsync('ROLLBACK;').catch(() => {});
      throw error;
    }
    version = nextVersion;
  }
}

async function getDatabase(): Promise<AnyDB | null> {
  if (Platform.OS === 'web') return null;
  if (db) return db;
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const SQLite = await import('expo-sqlite');
        const opened = await SQLite.openDatabaseAsync('streamvault.db');
        await opened.execAsync('PRAGMA journal_mode = WAL;');
        await runMigrations(opened as unknown as AnyDB);
        db = opened as unknown as AnyDB;
        dbInitializationError = null;
        return db;
      } catch (error: unknown) {
        dbInitializationError = toDatabaseError(error);
        dbPromise = null;
        return null;
      }
    })();
  }
  return dbPromise;
}

export async function saveDownload(item: DownloadItem): Promise<void> {
  const database = requireDatabase(await getDatabase());
  // Named columns so adding a new schema column does not silently shift positional bindings.
  // Any new column must be added explicitly here AND in the matching migration.
  await database.runAsync(
    `INSERT OR REPLACE INTO downloads (
      id, videoId, title, author, thumbnail,
      format, filePath, fileSize, downloadedBytes,
      status, progress, timestamp, errorMessage
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      item.id, item.videoId, item.title, item.author, item.thumbnail,
      item.format, item.filePath, item.fileSize, item.downloadedBytes,
      item.status, item.progress, item.timestamp, item.errorMessage ?? null,
    ]
  );
}

export async function getAllDownloads(): Promise<DownloadItem[]> {
  const database = requireDatabase(await getDatabase());
  return database.getAllAsync<DownloadItem>('SELECT * FROM downloads ORDER BY timestamp DESC');
}

export async function deleteDownload(id: string): Promise<void> {
  const database = requireDatabase(await getDatabase());
  await database.runAsync('DELETE FROM downloads WHERE id = ?', [id]);
}

export async function saveToHistory(item: LibraryItem): Promise<void> {
  const database = requireDatabase(await getDatabase());
  await database.runAsync(
    `INSERT OR REPLACE INTO history (id, videoId, title, author, thumbnail, lengthSeconds, watchedAt, watchProgress)
     VALUES (?,?,?,?,?,?,?,?)`,
    [item.id, item.videoId, item.title, item.author, item.thumbnail,
     item.lengthSeconds, item.watchedAt, item.watchProgress ?? 0]
  );
}

export async function getHistory(): Promise<LibraryItem[]> {
  const database = requireDatabase(await getDatabase());
  const rows = await database.getAllAsync<Omit<LibraryItem, 'type'>>(
    'SELECT * FROM history ORDER BY watchedAt DESC LIMIT 200'
  );
  return rows.map((r) => ({ ...r, watchProgress: r.watchProgress ?? 0, type: 'history' as const }));
}

export async function clearHistory(): Promise<void> {
  const database = requireDatabase(await getDatabase());
  await database.runAsync('DELETE FROM history');
}

export async function saveLiked(item: LibraryItem): Promise<void> {
  const database = requireDatabase(await getDatabase());
  await database.runAsync(
    `INSERT OR REPLACE INTO liked (id, videoId, title, author, thumbnail, lengthSeconds, watchedAt)
     VALUES (?,?,?,?,?,?,?)`,
    [item.id, item.videoId, item.title, item.author, item.thumbnail, item.lengthSeconds, item.watchedAt]
  );
}

export async function deleteLiked(videoId: string): Promise<void> {
  const database = requireDatabase(await getDatabase());
  await database.runAsync('DELETE FROM liked WHERE videoId = ?', [videoId]);
}

export async function getLiked(): Promise<LibraryItem[]> {
  const database = requireDatabase(await getDatabase());
  const rows = await database.getAllAsync<Omit<LibraryItem, 'type'>>(
    'SELECT * FROM liked ORDER BY watchedAt DESC'
  );
  return rows.map((r) => ({ ...r, watchProgress: r.watchProgress ?? 0, type: 'liked' as const }));
}

export async function saveSaved(item: LibraryItem): Promise<void> {
  const database = requireDatabase(await getDatabase());
  await database.runAsync(
    `INSERT OR REPLACE INTO saved (id, videoId, title, author, thumbnail, lengthSeconds, watchedAt)
     VALUES (?,?,?,?,?,?,?)`,
    [item.id, item.videoId, item.title, item.author, item.thumbnail, item.lengthSeconds, item.watchedAt]
  );
}

export async function deleteSaved(videoId: string): Promise<void> {
  const database = requireDatabase(await getDatabase());
  await database.runAsync('DELETE FROM saved WHERE videoId = ?', [videoId]);
}

export async function getSaved(): Promise<LibraryItem[]> {
  const database = requireDatabase(await getDatabase());
  const rows = await database.getAllAsync<Omit<LibraryItem, 'type'>>(
    'SELECT * FROM saved ORDER BY watchedAt DESC'
  );
  return rows.map((r) => ({ ...r, watchProgress: r.watchProgress ?? 0, type: 'saved' as const }));
}

export async function addSearchHistory(query: string): Promise<void> {
  const database = requireDatabase(await getDatabase());
  await database.runAsync(
    `INSERT OR REPLACE INTO search_history (query, timestamp) VALUES (?,?)`,
    [query, Date.now()]
  );
  await database.runAsync(
    'DELETE FROM search_history WHERE id NOT IN (SELECT id FROM search_history ORDER BY timestamp DESC LIMIT 20)'
  );
}

export async function getSearchHistory(): Promise<string[]> {
  const database = requireDatabase(await getDatabase());
  const rows = await database.getAllAsync<{ query: string }>(
    'SELECT query FROM search_history ORDER BY timestamp DESC LIMIT 20'
  );
  return rows.map((r) => r.query);
}

export async function clearSearchHistory(): Promise<void> {
  const database = requireDatabase(await getDatabase());
  await database.runAsync('DELETE FROM search_history');
}
