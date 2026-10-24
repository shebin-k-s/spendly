import crypto from 'crypto';
import { ApiError } from '../../common/middlewares/error.middleware';

const key = (): Buffer => {
    const secret = process.env.BACKUP_SECRET;
    if (!secret || secret.length < 16) throw new ApiError('BACKUP_SECRET is not configured (needs 16+ characters)', 503);
    return crypto.createHash('sha256').update(secret).digest();
};

/** AES-256-GCM: returns "iv.tag.ciphertext", each part base64. */
export function encrypt(plain: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function decrypt(blob: string): string {
    const [iv, tag, enc] = blob.split('.').map((p) => Buffer.from(p, 'base64'));
    if (!iv || !tag || !enc) throw new ApiError('Stored Drive key is damaged — reconnect Google Drive', 500);
    try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    } catch {
        throw new ApiError('Stored Drive key could not be read (BACKUP_SECRET changed?) — reconnect Google Drive', 500);
    }
}

/** Constant-time string comparison, for the scheduler's shared key. */
export function safeEqual(a: string, b: string): boolean {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}
