import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Category } from '../categories/category.entity';

// "Anything bought at this shop goes to this category" — fed to the AI parse
// prompts as a hard rule, so e.g. "milk from ayaans" lands in the shop's own
// category instead of a generic "Grocery".
@Entity('merchant_rules')
export class MerchantRule {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    name: string;

    // Other ways the shop gets written ("Ayaans", "Ayaan's") — the AI already
    // tolerates case/spacing differences, these cover genuinely different spellings.
    @Column('simple-array', { default: '' })
    aliases: string[];

    // Deleting the category deletes its rules — a rule pointing nowhere is useless.
    @ManyToOne(() => Category, { onDelete: 'CASCADE', nullable: false })
    @JoinColumn({ name: 'categoryId' })
    category: Category;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
