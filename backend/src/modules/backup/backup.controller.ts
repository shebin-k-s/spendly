import { Request, Response } from 'express';
import { ApiError } from '../../common/middlewares/error.middleware';
import { getISTParts } from '../../common/utils/date.utils';
import { exportAll, summarize, toBytes, parseBackup, restoreBackup, withAppDatabase } from './backup.service';
import * as driveService from './backup-drive.service';
import { safeEqual } from './secret.util';

export class BackupController {
    // Row counts per table right now — what a restore would overwrite.
    summary = async (_req: Request, res: Response) => {
        res.json({ tables: await withAppDatabase((db) => summarize(db)) });
    };

    // The whole database as one gzipped file.
    download = async (_req: Request, res: Response) => {
        const bytes = await toBytes(await withAppDatabase((db) => exportAll(db)));
        const { dateString, timeString } = getISTParts();
        const name = `spendly-backup-${dateString}-${timeString.replace(':', '')}.json.gz`;
        res.set({
            'Content-Type': 'application/gzip',
            'Content-Disposition': `attachment; filename="${name}"`,
            'Cache-Control': 'no-store',
        });
        res.send(bytes);
    };

    // ?dryRun=true loads the file in a transaction and rolls it back (proves it will work).
    // A real restore replaces everything, so it must carry confirm=RESTORE.
    restore = async (req: Request, res: Response) => {
        const file = (req as Request & { file?: Express.Multer.File }).file;
        if (!file) throw new ApiError('No backup file uploaded', 400);
        const dryRun = req.query.dryRun === 'true';
        if (!dryRun && req.body?.confirm !== 'RESTORE') throw new ApiError('Type RESTORE to confirm replacing all data', 400);

        const backup = await parseBackup(file.buffer);
        const result = await withAppDatabase((db) => restoreBackup(db, backup, dryRun));
        if (!dryRun) console.log(JSON.stringify({ level: 'warn', ts: new Date().toISOString(), msg: 'backup: database restored', backupCreatedAt: backup.createdAt, tables: result.tables.length }));
        res.json(result);
    };

    driveStatus = async (_req: Request, res: Response) => {
        res.json(await driveService.driveStatus());
    };

    // The browser is sent to this address to approve access on Google's own page.
    driveConnect = async (_req: Request, res: Response) => {
        res.json({ url: driveService.connectUrl() });
    };

    driveRun = async (_req: Request, res: Response) => {
        res.json(await driveService.runBackup());
    };

    driveAuto = async (req: Request, res: Response) => {
        await driveService.setAuto(!!req.body.enabled);
        res.json(await driveService.driveStatus());
    };

    driveDisconnect = async (_req: Request, res: Response) => {
        await driveService.disconnect();
        res.json(await driveService.driveStatus());
    };
}

// Reachable without the app login: Google's redirect after the user approves, and the daily scheduler.
export class BackupHooksController {
    driveCallback = async (req: Request, res: Response) => {
        const frontend = (process.env.FRONTEND_URL || 'http://localhost:8081').replace(/\/$/, '');
        const back = (params: Record<string, string>) => res.redirect(`${frontend}/backup?${new URLSearchParams(params)}`);
        try {
            if (req.query.error) return back({ drive: 'error', message: 'Google sign-in was cancelled' });
            await driveService.completeConnection(String(req.query.code ?? ''), String(req.query.state ?? ''));
            return back({ drive: 'connected' });
        } catch (err) {
            return back({ drive: 'error', message: err instanceof Error ? err.message.slice(0, 200) : 'Could not connect Google Drive' });
        }
    };

    // Called by a daily scheduled job carrying the shared key; safe to call as often as you like.
    scheduled = async (req: Request, res: Response) => {
        const expected = process.env.BACKUP_CRON_KEY;
        if (!expected || expected.length < 16) throw new ApiError('Scheduled backup is not set up', 503);
        const given = String(req.header('x-backup-key') ?? '');
        if (!safeEqual(given, expected)) throw new ApiError('Not allowed', 401);
        res.json(await driveService.runScheduled());
    };
}
