import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
} from 'typeorm';
import type { DebtTransaction } from './debt-transaction.entity';

@Entity('people')
export class Person {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({ nullable: true })
    phoneNumber: string;

    @OneToMany('DebtTransaction', (transaction: DebtTransaction) => transaction.person)
    transactions: DebtTransaction[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
