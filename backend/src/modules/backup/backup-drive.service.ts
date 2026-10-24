import jwt from 'jsonwebtoken';
import { AppDataSource } from '../../config/data.source';
import { ApiError } from '../../common/middlewares/error.middleware';
import { getISTParts } from '../../common/utils/date.utils';
import { BackupSettings } from './backup-settings.entity';
import { decrypt, encrypt } from './secret.util';
import { exportAll, toBytes, withAppDatabase } from './backup.service';
import * as drive from './google-drive.client';

export const KEEP_BACKUPS = 14;
// The scheduler may call more often than needed; a successful backup newer than this means "already done".
const SCHEDULE_MIN_GAP_HOURS = 20;

const repo = () => AppDataSource.getRepository(BackupSettings);
let running = false;

async function getSettings(): Promise<BackupSettings> {
    const existing = await repo().findOneBy({ id: 'default' });
    if (existing) return existing;
    return repo().save(
        repo().create({ id: 'default', refreshTokenEnc: null, accountEmail: null, folderId: null, autoEnabled: false, lastRunAt: null, lastStatus: null, lastMessage: null, lastFileName: null }),
    );
}

function requireConfigured() {
    if (!drive.isConfigured()) {
        throw new ApiError('Google Drive backup is not set up on the server (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / BACKEND_URL / BACKUP_SECRET)', 503);
    }
}

export async function driveStatus() {
    const s = await getSettings();
    return {
        configured: drive.isConfigured(),
        connected: !!s.refreshTokenEnc,
        accountEmail: s.accountEmail,
        folderUrl: s.folderId ? `https://drive.google.com/drive/folders/${s.folderId}` : null,
        autoEnabled: s.autoEnabled,
        schedulerKeySet: !!process.env.BACKUP_CRON_KEY,
        lastRunAt: s.lastRunAt,
        lastStatus: s.lastStatus,
        lastMessage: s.lastMessage,
        lastFileName: s.lastFileName,
        keep: KEEP_BACKUPS,
    };
}

/** The Google consent-screen address; `state` proves the callback belongs to a sign-in we started. */
export function connectUrl(): string {
    requireConfigured();
    const state = jwt.sign({ purpose: 'drive-connect' }, process.env.JWT_SECRET!, { expiresIn: '10m' });
    return drive.buildAuthUrl(state);
}

export async function completeConnection(code: string, state: string): Promise<void> {
    requireConfigured();
    try {
        const decoded: any = jwt.verify(state, process.env.JWT_SECRET!);
        if (decoded?.purpose !== 'drive-connect') throw new Error('wrong purpose');
    } catch {
        throw new ApiError('This Google sign-in link is invalid or has expired — start again from the Backup page', 400);
    }
    const { refreshToken, accessToken } = await drive.exchangeCode(code);
    const s = await getSettings();
    s.refreshTokenEnc = encrypt(refreshToken);
    s.accountEmail = await drive.accountEmail(accessToken);
    s.folderId = await drive.ensureFolder(accessToken, s.folderId);
    s.lastStatus = null;
    s.lastMessage = null;
    await repo().save(s);
}

export async function disconnect(): Promise<void> {
    const s = await getSettings();
    if (s.refreshTokenEnc) {
        try {
            await drive.revoke(decrypt(s.refreshTokenEnc));
        } catch {
            /* the token may already be unreadable — clearing it below is what matters */
        }
    }
    s.refreshTokenEnc = null;
    s.accountEmail = null;
    s.autoEnabled = false;
    await repo().save(s);
    // folderId is kept so reconnecting reuses the same folder instead of making a second one.
}

export async function setAuto(enabled: boolean): Promise<void> {
    const s = await getSettings();
    if (enabled && !s.refreshTokenEnc) throw new ApiError('Connect Google Drive first', 400);
    s.autoEnabled = enabled;
    await repo().save(s);
}

export interface DriveRunResult {
    fileName: string;
    sizeBytes: number;
    kept: number;
    deleted: number;
}

/** Makes a full backup and puts it in the Drive folder, then trims the folder to the newest KEEP_BACKUPS. */
export async function runBackup(): Promise<DriveRunResult> {
    requireConfigured();
    const s = await getSettings();
    if (!s.refreshTokenEnc) throw new ApiError('Connect Google Drive first', 400);
    if (running) throw new ApiError('A backup is already running', 409);
    running = true;
    try {
        const bytes = await toBytes(await withAppDatabase((db) => exportAll(db)));
        const { dateString, timeString } = getISTParts();
        const fileName = `${drive.BACKUP_PREFIX}${dateString}-${timeString.replace(':', '')}.json.gz`;

        const accessToken = await drive.accessTokenFor(decrypt(s.refreshTokenEnc));
        s.folderId = await drive.ensureFolder(accessToken, s.folderId);
        await drive.uploadFile(accessToken, s.folderId, fileName, bytes);

        const files = await drive.listBackups(accessToken, s.folderId);
        const old = files.slice(KEEP_BACKUPS);
        for (const f of old) await drive.deleteFile(accessToken, f.id);

        s.lastRunAt = new Date();
        s.lastStatus = 'ok';
        s.lastMessage = `Uploaded ${fileName}`;
        s.lastFileName = fileName;
        await repo().save(s);
        return { fileName, sizeBytes: bytes.length, kept: Math.min(files.length, KEEP_BACKUPS), deleted: old.length };
    } catch (err) {
        s.lastRunAt = new Date();
        s.lastStatus = 'error';
        s.lastMessage = err instanceof Error ? err.message.slice(0, 300) : 'Backup failed';
        await repo().save(s).catch(() => undefined);
        throw err;
    } finally {
        running = false;
    }
}

/** What the daily scheduler calls: backs up only when automatic backup is on and none is recent. */
export async function runScheduled(): Promise<{ ran: boolean; reason?: string; fileName?: string }> {
    const s = await getSettings();
    if (!s.refreshTokenEnc) return { ran: false, reason: 'Google Drive is not connected' };
    if (!s.autoEnabled) return { ran: false, reason: 'Automatic backup is turned off' };
    if (s.lastStatus === 'ok' && s.lastRunAt && Date.now() - s.lastRunAt.getTime() < SCHEDULE_MIN_GAP_HOURS * 3_600_000) {
        return { ran: false, reason: 'A backup was already made in the last day' };
    }
    const result = await runBackup();
    return { ran: true, fileName: result.fileName };
}
