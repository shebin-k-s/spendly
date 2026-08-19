import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Unique } from 'typeorm';

@Entity('monthly_ai_insights')
@Unique(['year', 'month'])
export class MonthlyAiInsight {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('int')
    year: number;

    @Column('int')
    month: number;

    // SHA-256 of the exact numbers the points below were generated from —
    // if today's numbers hash differently, the cached points are stale.
    @Column()
    inputHash: string;

    // JSON array of short standalone points (see MonthAnalysisInput) — stored
    // as text since this is a small, disposable cache, not a queried field.
    @Column('text')
    points: string;

    // Update, not create — this row is reused/overwritten every time the
    // month is re-analyzed, and generatedAt should reflect the latest one.
    @UpdateDateColumn()
    generatedAt: Date;
}
