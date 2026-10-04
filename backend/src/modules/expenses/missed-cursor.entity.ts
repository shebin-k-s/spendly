import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

// The single, forward-only "everything at or before this day is resolved"
// date for missed-expense suggestions — one row, shared by every device.
@Entity('missed_cursor')
export class MissedCursor {
    @PrimaryColumn()
    id: string;

    @Column({ type: 'date' })
    date: string;

    @UpdateDateColumn()
    updatedAt: Date;
}
