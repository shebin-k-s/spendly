import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique, Index } from 'typeorm';

// One "possibly missed" suggestion the user resolved without it turning into
// a matching expense — discarded ("I didn't do this that day") or saved under
// a different category than suggested. Lives server-side, not per-device, so
// resolving a suggestion on one device resolves it everywhere.
@Entity('missed_dismissals')
@Unique(['date', 'categoryId', 'slotKey'])
export class MissedDismissal {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Index()
    @Column({ type: 'date' })
    date: string;

    @Column()
    categoryId: string;

    @Column()
    slotKey: string;

    @CreateDateColumn()
    createdAt: Date;
}
