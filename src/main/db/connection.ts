/**
 * SQLite storage, backed by sql.js (SQLite compiled to WebAssembly).
 *
 * Why WASM and not a native binding: this app is meant to be forked and hacked
 * on by students. A native module means every contributor on Windows needs
 * Visual Studio build tools before `npm install` succeeds. sql.js installs
 * everywhere with no toolchain, and the data set here - one student's project
 * plan - is far too small for the performance difference to matter.
 *
 * The tradeoff is that the database lives in memory and must be written back to
 * disk explicitly. Every mutating operation therefore write-throughs: export,
 * write to a temp file, atomic rename. A few hundred kilobytes takes about a
 * millisecond, and nothing is ever lost to a crash between saves.
 */
import fs from 'node:fs'
import path from 'node:path'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

import { MIGRATIONS } from './schema'

export type SqlValue = string | number | null | Uint8Array
export type Params = SqlValue[]

let SQL: SqlJsStatic | null = null
let db: Database | null = null
let dbPath = ''

/** sql.js needs its `.wasm` next to it; the location differs dev vs packaged. */
function locateWasm(fileName: string, resourcesPath: string, appPath: string): string {
  const candidates = [
    path.join(resourcesPath, fileName),
    path.join(appPath, 'node_modules', 'sql.js', 'dist', fileName),
    path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', fileName),
    path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', fileName)
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return candidates[candidates.length - 1]
}

export interface OpenOptions {
  file: string
  resourcesPath: string
  appPath: string
}

export async function openDatabase({ file, resourcesPath, appPath }: OpenOptions): Promise<void> {
  if (!SQL) {
    SQL = await initSqlJs({ locateFile: (f) => locateWasm(f, resourcesPath, appPath) })
  }
  dbPath = file
  fs.mkdirSync(path.dirname(file), { recursive: true })

  db = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database()
  db.run('PRAGMA foreign_keys = ON;')
  migrate()
  persist()
}

function handle(): Database {
  if (!db) throw new Error('Database is not open')
  return db
}

function migrate(): void {
  const database = handle()
  database.run(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);`)
  const current = (get<{ version: number }>('SELECT MAX(version) AS version FROM schema_version')
    ?.version ?? 0) as number

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue
    database.run('BEGIN')
    try {
      database.run(migration.sql)
      database.run('INSERT INTO schema_version (version) VALUES (?)', [migration.version])
      database.run('COMMIT')
    } catch (error) {
      database.run('ROLLBACK')
      throw new Error(
        `Migration ${migration.version} (${migration.name}) failed: ${(error as Error).message}`
      )
    }
  }
}

/** Write the in-memory database back to disk atomically. */
export function persist(): void {
  if (!db || !dbPath) return
  const data = Buffer.from(db.export())
  const temp = `${dbPath}.tmp`
  fs.writeFileSync(temp, data)
  fs.renameSync(temp, dbPath)
}

export function all<T = Record<string, SqlValue>>(sql: string, params: Params = []): T[] {
  const stmt = handle().prepare(sql)
  try {
    stmt.bind(params)
    const rows: T[] = []
    while (stmt.step()) rows.push(stmt.getAsObject() as T)
    return rows
  } finally {
    stmt.free()
  }
}

export function get<T = Record<string, SqlValue>>(sql: string, params: Params = []): T | undefined {
  return all<T>(sql, params)[0]
}

/** Run a statement and return the id of the row it inserted, when it inserted one. */
export function run(sql: string, params: Params = []): number {
  const database = handle()
  database.run(sql, params)
  const row = get<{ id: number }>('SELECT last_insert_rowid() AS id')
  return row?.id ?? 0
}

/**
 * Run `fn` inside a transaction and persist once at the end. Nested calls join
 * the outer transaction rather than starting a new one.
 */
let depth = 0
export function transaction<T>(fn: () => T): T {
  const database = handle()
  if (depth > 0) return fn()
  database.run('BEGIN')
  depth++
  try {
    const result = fn()
    database.run('COMMIT')
    depth--
    persist()
    return result
  } catch (error) {
    database.run('ROLLBACK')
    depth--
    throw error
  }
}

export function closeDatabase(): void {
  if (!db) return
  persist()
  db.close()
  db = null
}

export function databasePath(): string {
  return dbPath
}

/** Booleans are stored as 0/1; `undefined` becomes NULL. */
export function toSql(value: unknown): SqlValue {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') return value
  if (value instanceof Uint8Array) return value
  return String(value)
}

export function bool(value: SqlValue | undefined): boolean {
  return value === 1 || value === '1'
}
