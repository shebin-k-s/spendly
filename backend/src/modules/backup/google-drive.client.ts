import crypto from 'crypto';
import { ApiError } from '../../common/middlewares/error.middleware';

// Thin wrapper over the few Google endpoints the backup needs. Every base URL can be
// overridden through the environment so the whole flow can be tested against a fake
// Google; in production the defaults are the real ones.

const SCOPE = 'https://www.googleapis.com/auth/drive.file'; // only files this app creates
export const FOLDER_NAME = 'Spendly Backups';
export const BACKUP_PREFIX = 'spendly-backup-';

const urls = () => ({
    auth: process.env.GOOGLE_AUTH_URL ?? 'https://accounts.google.com/o/oauth2/v2/auth',
    token: process.env.GOOGLE_TOKEN_URL ?? 'https://oauth2.googleapis.com/token',
    revoke: process.env.GOOGLE_REVOKE_URL ?? 'https://oauth2.googleapis.com/revoke',
    api: process.env.GOOGLE_API_URL ?? 'https://www.googleapis.com',
});

// Only the site address (scheme + host) of BACKEND_URL is used, so a trailing slash or a pasted
// full callback address can't produce a doubled path.
const backendOrigin = () => {
    const raw = (process.env.BACKEND_URL ?? '').trim();
    try {
        return new URL(raw).origin;
    } catch {
        return raw.replace(/\/+$/, '');
    }
};

export const redirectUri = () => `${backendOrigin()}/api/v1/backup-hooks/drive-callback`;

export function isConfigured(): boolean {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.BACKEND_URL && (process.env.BACKUP_SECRET ?? '').length >= 16);
}

export class DriveAccessLostError extends ApiError {
    constructor() {
        super('Google Drive access was revoked or has expired — connect Google Drive again', 401);
    }
}

async function failure(res: Response, what: string): Promise<never> {
    let detail = '';
    try {
        const body: any = await res.json();
        detail = body?.error_description ?? body?.error?.message ?? (typeof body?.error === 'string' ? body.error : '');
    } catch {
        /* not JSON */
    }
    throw new ApiError(`Google Drive: ${what} failed (${res.status}${detail ? `: ${detail}` : ''})`, 502);
}

export function buildAuthUrl(state: string): string {
    const q = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        redirect_uri: redirectUri(),
        response_type: 'code',
        scope: SCOPE,
        access_type: 'offline',
        // consent: Google only returns a refresh token when consent is shown.
        // select_account: always ask which Google account, so switching accounts is possible.
        prompt: 'consent select_account',
        state,
    });
    return `${urls().auth}?${q}`;
}

async function tokenRequest(params: Record<string, string>): Promise<any> {
    const res = await fetch(urls().token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }),
    });
    if (!res.ok) {
        const body: any = await res.clone().json().catch(() => ({}));
        if (body?.error === 'invalid_grant') throw new DriveAccessLostError();
        return failure(res, 'sign-in');
    }
    return res.json();
}

export async function exchangeCode(code: string): Promise<{ refreshToken: string; accessToken: string }> {
    const t = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri() });
    if (!t.refresh_token) {
        throw new ApiError('Google did not return a long-lived key. Remove "Spendly" at myaccount.google.com/permissions, then connect again', 502);
    }
    return { refreshToken: t.refresh_token, accessToken: t.access_token };
}

export async function accessTokenFor(refreshToken: string): Promise<string> {
    return (await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' })).access_token;
}

const auth = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

export async function accountEmail(accessToken: string): Promise<string | null> {
    const res = await fetch(`${urls().api}/drive/v3/about?fields=user(emailAddress)`, { headers: auth(accessToken) });
    if (!res.ok) return null;
    return ((await res.json()) as any)?.user?.emailAddress ?? null;
}

/** Returns the id of the backup folder, creating it when it was never made or has been deleted. */
export async function ensureFolder(accessToken: string, existingId: string | null): Promise<string> {
    if (existingId) {
        const res = await fetch(`${urls().api}/drive/v3/files/${encodeURIComponent(existingId)}?fields=id,trashed`, { headers: auth(accessToken) });
        if (res.ok && !((await res.json()) as any).trashed) return existingId;
        // 404/403: the folder is gone, or belongs to a different Google account than the one now connected —
        // either way make a fresh one in this account instead of failing.
        if (!res.ok && res.status !== 404 && res.status !== 403) return failure(res, 'looking up the backup folder');
    }
    const res = await fetch(`${urls().api}/drive/v3/files?fields=id`, {
        method: 'POST',
        headers: { ...auth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    if (!res.ok) return failure(res, 'creating the backup folder');
    return ((await res.json()) as any).id;
}

export interface DriveFile {
    id: string;
    name: string;
    createdTime: string;
    size?: string;
}

export async function uploadFile(accessToken: string, folderId: string, name: string, data: Buffer): Promise<DriveFile> {
    const boundary = `spendly${crypto.randomBytes(8).toString('hex')}`;
    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folderId] })}\r\n--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`),
        data,
        Buffer.from(`\r\n--${boundary}--`),
    ]);
    const res = await fetch(`${urls().api}/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime`, {
        method: 'POST',
        headers: { ...auth(accessToken), 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
    });
    if (!res.ok) return failure(res, 'uploading the backup');
    return res.json() as Promise<DriveFile>;
}

/** Backup files in the folder, newest first. */
export async function listBackups(accessToken: string, folderId: string): Promise<DriveFile[]> {
    const q = `'${folderId}' in parents and trashed = false and name contains '${BACKUP_PREFIX}'`;
    const params = new URLSearchParams({ q, orderBy: 'createdTime desc', pageSize: '200', fields: 'files(id,name,createdTime,size)' });
    const res = await fetch(`${urls().api}/drive/v3/files?${params}`, { headers: auth(accessToken) });
    if (!res.ok) return failure(res, 'listing backups');
    return ((await res.json()) as any).files ?? [];
}

export async function deleteFile(accessToken: string, id: string): Promise<void> {
    const res = await fetch(`${urls().api}/drive/v3/files/${encodeURIComponent(id)}`, { method: 'DELETE', headers: auth(accessToken) });
    if (!res.ok && res.status !== 404) await failure(res, 'deleting an old backup');
}

export async function revoke(token: string): Promise<void> {
    await fetch(urls().revoke, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) }).catch(() => undefined);
}
