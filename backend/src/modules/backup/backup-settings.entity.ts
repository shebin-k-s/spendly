import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

// The single row that holds the Google Drive connection. It is deliberately left out
// of backups and restores (see EXCLUDED_TABLES): a backup must never carry the access
// key, and restoring an old backup must not disconnect Drive.
@Entity('backup_settings')
export class BackupSettings {
    @PrimaryColumn()
    id: string; // always 'default'

    // AES-256-GCM encrypted Google refresh token — never stored in plain text.
    @Column({ type: 'text', nullable: true })
    refreshTokenEnc: string | null;

    @Column({ type: 'varchar', nullable: true })
    accountEmail: string | null;

    // The "Spendly Backups" folder this app created in the connected Drive.
    @Column({ type: 'varchar', nullable: true })
    folderId: string | null;

    @Column({ default: false })
    autoEnabled: boolean;

    @Column({ type: 'timestamptz', nullable: true })
    lastRunAt: Date | null;

    @Column({ type: 'varchar', nullable: true })
    lastStatus: 'ok' | 'error' | null;

    @Column({ type: 'text', nullable: true })
    lastMessage: string | null;

    @Column({ type: 'varchar', nullable: true })
    lastFileName: string | null;

    @UpdateDateColumn()
    updatedAt: Date;
}
