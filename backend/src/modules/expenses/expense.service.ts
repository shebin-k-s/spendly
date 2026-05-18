import { AppDataSource } from '../../config/data.source';
import { Expense } from './expense.entity';
import { ApiError } from '../../common/middlewares/error.middleware';

export class ExpenseService {
    private repo = AppDataSource.getRepository(Expense);

    async getByMonth(year: number, month: number, categoryId?: string) {
        // month is 1-indexed
        const monthStr = month.toString().padStart(2, '0');
        const lastDay = new Date(year, month, 0).getDate();
        const start = `${year}-${monthStr}-01`;
        const end = `${year}-${monthStr}-${lastDay.toString().padStart(2, '0')}`;

        const qb = this.repo
            .createQueryBuilder('expense')
            .leftJoinAndSelect('expense.category', 'category')
            .where('expense.date >= :start AND expense.date <= :end', { start, end });

        if (categoryId) {
            qb.andWhere('category.id = :categoryId', { categoryId });
        }

        const expenses = await qb.getMany();

        // Sort reliably combining user-provided time and createdAt normalized to HH:mm
        return expenses.sort((a, b) => {
            if (a.date !== b.date) {
                return a.date > b.date ? -1 : 1; // date DESC
            }
            
            const getHHMM = (d: Date) => {
                const hh = d.getHours().toString().padStart(2, '0');
                const mm = d.getMinutes().toString().padStart(2, '0');
                return `${hh}:${mm}`;
            };
            
            const timeA = a.time || getHHMM(new Date(a.createdAt));
            const timeB = b.time || getHHMM(new Date(b.createdAt));
            
            if (timeA !== timeB) {
                return timeA > timeB ? -1 : 1; // effective time DESC
            }
            
            // Fallback absolute ms 
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
    }

    async getById(id: string) {
        const expense = await this.repo.findOne({
            where: { id },
            relations: ['category'],
        });
        if (!expense) throw new ApiError('Expense not found', 404);
        return expense;
    }

    async create(data: Partial<Expense> & { categoryId?: string }) {
        const { categoryId, ...rest } = data;
        const expense = this.repo.create({
            ...rest,
            ...(categoryId ? { category: { id: categoryId } as any } : {}),
        });
        return this.repo.save(expense);
    }

    async update(id: string, data: Partial<Expense> & { categoryId?: string }) {
        const expense = await this.getById(id);
        const { categoryId, ...rest } = data;
        Object.assign(expense, rest);
        if (categoryId !== undefined) {
            expense.category = categoryId ? ({ id: categoryId } as any) : null as any;
        }
        return this.repo.save(expense);
    }

    async delete(id: string) {
        const expense = await this.getById(id);
        await this.repo.remove(expense);
    }

    async getMonthlySummary(year: number, month: number) {
        const monthStr = month.toString().padStart(2, '0');
        const lastDay = new Date(year, month, 0).getDate();
        const start = `${year}-${monthStr}-01`;
        const end = `${year}-${monthStr}-${lastDay.toString().padStart(2, '0')}`;

        const rows = await this.repo
            .createQueryBuilder('expense')
            .leftJoinAndSelect('expense.category', 'category')
            .where('expense.date >= :start AND expense.date <= :end', { start, end })
            .getMany();

        const total = rows.reduce((sum, e) => sum + Number(e.amount), 0);
        const cashbackTotal = rows.reduce((sum, e) => sum + Number(e.cashback || 0), 0);

        const byCategory: Record<string, { categoryId: string; name: string; icon: string; color: string; total: number; cashbackTotal: number; count: number }> = {};

        for (const expense of rows) {
            const catId = expense.category?.id || 'uncategorized';
            if (!byCategory[catId]) {
                byCategory[catId] = {
                    categoryId: catId,
                    name: expense.category?.name || 'Uncategorized',
                    icon: expense.category?.icon || '📦',
                    color: expense.category?.color || '#94a3b8',
                    total: 0,
                    cashbackTotal: 0,
                    count: 0,
                };
            }
            byCategory[catId].total += Number(expense.amount);
            byCategory[catId].cashbackTotal += Number(expense.cashback || 0);
            byCategory[catId].count += 1;
        }

        return {
            year,
            month,
            total: Math.round(total * 100) / 100,
            cashbackTotal: Math.round(cashbackTotal * 100) / 100,
            count: rows.length,
            breakdown: Object.values(byCategory).sort((a, b) => (b.total - b.cashbackTotal) - (a.total - a.cashbackTotal)),
        };
    }

    async getAnalytics(months: number = 6) {
        const result: Array<{ year: number; month: number; total: number; count: number }> = [];

        const now = new Date();
        for (let i = months - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            const monthStr = month.toString().padStart(2, '0');
            const lastDay = new Date(year, month, 0).getDate();
            const start = `${year}-${monthStr}-01`;
            const end = `${year}-${monthStr}-${lastDay.toString().padStart(2, '0')}`;

            const rows = await this.repo
                .createQueryBuilder('expense')
                .select('SUM(expense.amount)', 'total')
                .addSelect('SUM(expense.cashback)', 'cashbackTotal')
                .addSelect('COUNT(*)', 'count')
                .where('expense.date >= :start AND expense.date <= :end', { start, end })
                .getRawOne();

            result.push({
                year,
                month,
                total: Math.round(Number(rows?.total || 0) * 100) / 100,
                cashbackTotal: Math.round(Number(rows?.cashbackTotal || 0) * 100) / 100,
                count: Number(rows?.count || 0),
            });
        }

        return result;
    }
}
