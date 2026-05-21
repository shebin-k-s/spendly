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
import { Person } from './person.entity';

export type DebtType = 'GIVEN' | 'RETURNED';

@Entity('debt_transactions')
export class DebtTransaction {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('decimal', { precision: 12, scale: 2 })
    amount: number;

    @Column({
        type: 'varchar',
        length: 20,
    })
    type: DebtType;

    @Index()
    @Column({ type: 'date' })
    date: string;

    @Column({ nullable: true })
    note: string;

    @Index()
    @ManyToOne(() => Person, (person) => person.transactions, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'personId' })
    person: Person;

    @Column()
    personId: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
