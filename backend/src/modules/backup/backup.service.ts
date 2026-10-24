import { promisify } from 'util';
import zlib from 'zlib';
import { AppDataSource } from '../../config/data.source';
import { ApiError } from '../../common/middlewares/error.middleware';
import { CategoryService } from '../categories/category.service';
import { WebauthnService } from '../webauthn/webauthn.service';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// Whole-database backup, done in plain SQL through the existing connection, so it
// needs no pg_dump binary (the host doesn't have one). Every table in the public
// schema is written as JSON rows, which Postgres itself can load back
// (jsonb_populate_recordset), so dates, decimals, uuids and arrays survive exactly.

export const BACKUP_FORMAT = 1;
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;

/** The one thing the backup code needs from a database connection. */
export interface Queryable {
    query(sql: string, params?: unknown[]): Promise<any[]>;
}

/** A connection that can also run the restore as one all-or-nothing transaction. */
export interface TransactionRunner extends Queryable {
    begin(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
}

export interface BackupFile {
    app: 'spendly';
    format: number;
    createdAt: string;
    tables: Record<string, { rows: Record<string, unknown>[] }>;
}

export interface TableSummary {
    table: string;
    rows: number;
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

export async function listTables(q: Queryable): Promise<string[]> {
    const rows = await q.query(
        `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
    );
    return rows.map((r) => r.table_name as string);
}

/** Tables ordered so that every table comes after the tables it has foreign keys to. */
export async function insertOrder(q: Queryable, tables: string[]): Promise<string[]> {
    const edges = await q.query(
        `select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent
         from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace`,
    );
    const clean = (n: string) => n.replace(/^public\./, '').replace(/^"|"$/g, '');
    const wanted = new Set(tables);
    const parents = new Map<string, Set<string>>(tables.map((t) => [t, new Set<string>()]));
    for (const e of edges) {
        const child = clean(e.child);
        const parent = clean(e.parent);
        if (child !== parent && wanted.has(child) && wanted.has(parent)) parents.get(child)!.add(parent);
    }
    const ordered: string[] = [];
    const done = new Set<string>();
    while (ordered.length < tables.length) {
        const ready = tables.filter((t) => !done.has(t) && [...parents.get(t)!].every((p) => done.has(p)));
        if (ready.length === 0) throw new ApiError('Tables reference each other in a cycle — cannot order the restore', 500);
        for (const t of ready) {
            ordered.push(t);
            done.add(t);
        }
    }
    return ordered;
}

export async function summarize(q: Queryable): Promise<TableSummary[]> {
    const out: TableSummary[] = [];
    for (const table of await listTables(q)) {
        const [r] = await q.query(`select count(*)::int as n from ${quote(table)}`);
        out.push({ table, rows: r.n });
    }
    return out;
}

export async function exportAll(q: Queryable): Promise<BackupFile> {
    const tables: BackupFile['tables'] = {};
    for (const table of await listTables(q)) {
        const [r] = await q.query(`select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as rows from ${quote(table)} t`);
        tables[table] = { rows: r.rows };
    }
    return { app: 'spendly', format: BACKUP_FORMAT, createdAt: new Date().toISOString(), tables };
}

export async function toBytes(file: BackupFile): Promise<Buffer> {
    return gzip(Buffer.from(JSON.stringify(file)));
}

/** Reads an uploaded backup (gzipped or plain JSON) and checks it really is one of ours. */
export async function parseBackup(buf: Buffer): Promise<BackupFile> {
    if (buf.length === 0) throw new ApiError('The file is empty', 400);
    let json: Buffer = buf;
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
        try {
            json = await gunzip(buf, { maxOutputLength: MAX_BACKUP_BYTES * 4 });
        } catch {
            throw new ApiError('The file is damaged and could not be unzipped', 400);
        }
    }
    let data: any;
    try {
        data = JSON.parse(json.toString('utf8'));
    } catch {
        throw new ApiError('This is not a Spendly backup file', 400);
    }
    if (!data || data.app !== 'spendly' || typeof data.tables !== 'object' || data.tables === null) {
        throw new ApiError('This is not a Spendly backup file', 400);
    }
    if (data.format !== BACKUP_FORMAT) throw new ApiError(`Unsupported backup version ${data.format}`, 400);
    for (const [name, t] of Object.entries<any>(data.tables)) {
        if (!t || !Array.isArray(t.rows)) throw new ApiError(`Backup is damaged: table "${name}" has no rows list`, 400);
    }
    return data as BackupFile;
}

export interface RestoreResult {
    dryRun: boolean;
    createdAt: string;
    tables: { table: string; backupRows: number; currentRows: number }[];
}

/**
 * Replaces the contents of every table in the backup with the backup's rows, all in
 * one transaction: any problem rolls everything back and the data is untouched.
 * dryRun does the full restore and then rolls it back, proving the file will load.
 */
export async function restoreBackup(db: TransactionRunner, file: BackupFile, dryRun: boolean): Promise<RestoreResult> {
    const inDb = new Set(await listTables(db));
    const names = Object.keys(file.tables);
    const unknown = names.filter((n) => !inDb.has(n));
    if (unknown.length) throw new ApiError(`The backup has tables this database doesn't: ${unknown.join(', ')}`, 400);

    const order = await insertOrder(db, names);
    const current = new Map((await summarize(db)).map((s) => [s.table, s.rows]));

    await db.begin();
    try {
        if (order.length) await db.query(`truncate table ${order.map(quote).join(', ')}`);
        for (const table of order) {
            const rows = file.tables[table].rows;
            if (rows.length === 0) continue;
            await db.query(`insert into ${quote(table)} select * from jsonb_populate_recordset(null::${quote(table)}, $1::jsonb)`, [JSON.stringify(rows)]);
            const [r] = await db.query(`select count(*)::int as n from ${quote(table)}`);
            if (r.n !== rows.length) throw new ApiError(`Table "${table}" restored ${r.n} of ${rows.length} rows — nothing was changed`, 500);
        }
        if (dryRun) await db.rollback();
        else await db.commit();
    } catch (err) {
        await db.rollback().catch(() => undefined);
        if (err instanceof ApiError) throw err;
        const detail = err instanceof Error ? err.message.split('\n')[0] : String(err);
        throw new ApiError(`The backup could not be loaded (${detail}) — nothing was changed`, 400);
    }

    if (!dryRun) {
        // In-memory copies of rows that were just replaced.
        CategoryService.clearCache();
        WebauthnService.clearCache();
    }
    return {
        dryRun,
        createdAt: file.createdAt,
        tables: order.map((table) => ({ table, backupRows: file.tables[table].rows.length, currentRows: current.get(table) ?? 0 })),
    };
}

/** The app's own connection, wrapped for backup/restore. */
export async function withAppDatabase<T>(fn: (db: TransactionRunner) => Promise<T>): Promise<T> {
    const runner = AppDataSource.createQueryRunner();
    await runner.connect();
    try {
        return await fn({
            query: (sql, params) => runner.query(sql, params),
            begin: () => runner.startTransaction(),
            commit: () => runner.commitTransaction(),
            rollback: () => runner.rollbackTransaction(),
        });
    } finally {
        await runner.release();
    }
}
