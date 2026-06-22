import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    CreateDateColumn,
    UpdateDateColumn,
    JoinColumn,
    Index,
} from 'typeorm';
import { Category } from '../categories/category.entity';

@Entity('expenses')
export class Expense {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('decimal', { precision: 12, scale: 2 })
    amount: number;

    @Column('decimal', { precision: 12, scale: 2, nullable: true, default: 0 })
    cashback: number;

    @Column()
    description: string;

    @Index()
    @Column({ type: 'date' })
    date: string;

    @Column({ type: 'varchar', length: 5, nullable: true, default: null })
    time: string | null;

    @Column({ nullable: true })
    note: string;

    @Index()
    @ManyToOne(() => Category, (category) => category.expenses, {
        onDelete: 'SET NULL',
        nullable: true,
        eager: true,
    })
    @JoinColumn()
    category: Category;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
