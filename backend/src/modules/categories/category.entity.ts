import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    OneToMany,
} from 'typeorm';
import { Expense } from '../expenses/expense.entity';

@Entity('categories')
export class Category {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    name: string;

    @Column()
    icon: string;

    @Column()
    color: string;

    @Column({ default: false })
    isDefault: boolean;

    @OneToMany(() => Expense, (expense) => expense.category)
    expenses: Expense[];

    @CreateDateColumn()
    createdAt: Date;
}
