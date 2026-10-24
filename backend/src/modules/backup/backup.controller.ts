import { Request, Response } from 'express';
import { ApiError } from '../../common/middlewares/error.middleware';
import { getISTParts } from '../../common/utils/date.utils';
import { exportAll, summarize, toBytes, parseBackup, restoreBackup, withAppDatabase } from './backup.service';

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
}
