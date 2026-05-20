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

        const dbSummary = await this.repo
            .createQueryBuilder('expense')
            .select('SUM(expense.amount)', 'total')
            .addSelect('SUM(expense.cashback)', 'cashbackTotal')
            .addSelect('COUNT(expense.id)', 'count')
            .where('expense.date >= :start AND expense.date <= :end', { start, end })
            .getRawOne();

        const dbBreakdown = await this.repo
            .createQueryBuilder('expense')
            .leftJoin('expense.category', 'category')
            .select('category.id', 'categoryId')
            .addSelect('category.name', 'name')
            .addSelect('category.icon', 'icon')
            .addSelect('category.color', 'color')
            .addSelect('SUM(expense.amount)', 'total')
            .addSelect('SUM(expense.cashback)', 'cashbackTotal')
            .addSelect('COUNT(expense.id)', 'count')
            .where('expense.date >= :start AND expense.date <= :end', { start, end })
            .groupBy('category.id')
            .getRawMany();

        const total = Math.round(Number(dbSummary?.total || 0) * 100) / 100;
        const cashbackTotal = Math.round(Number(dbSummary?.cashbackTotal || 0) * 100) / 100;

        const breakdown = dbBreakdown.map(r => ({
            categoryId: r.categoryId || 'uncategorized',
            name: r.name || 'Uncategorized',
            icon: r.icon || '📦',
            color: r.color || '#94a3b8',
            total: Number(r.total || 0),
            cashbackTotal: Number(r.cashbackTotal || 0),
            count: Number(r.count || 0),
        })).sort((a, b) => (b.total - b.cashbackTotal) - (a.total - a.cashbackTotal));

        return {
            year,
            month,
            total,
            cashbackTotal,
            count: Number(dbSummary?.count || 0),
            breakdown,
        };
    }

    async getAnalytics(months: number = 6) {
        const now = new Date();
        const promises = [];

        for (let i = months - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            const monthStr = month.toString().padStart(2, '0');
            const lastDay = new Date(year, month, 0).getDate();
            const start = `${year}-${monthStr}-01`;
            const end = `${year}-${monthStr}-${lastDay.toString().padStart(2, '0')}`;

            const q = this.repo
                .createQueryBuilder('expense')
                .select('SUM(expense.amount)', 'total')
                .addSelect('SUM(expense.cashback)', 'cashbackTotal')
                .addSelect('COUNT(*)', 'count')
                .where('expense.date >= :start AND expense.date <= :end', { start, end })
                .getRawOne()
                .then(rows => ({
                    year,
                    month,
                    total: Math.round(Number(rows?.total || 0) * 100) / 100,
                    cashbackTotal: Math.round(Number(rows?.cashbackTotal || 0) * 100) / 100,
                    count: Number(rows?.count || 0),
                }));
            promises.push(q);
        }

        return await Promise.all(promises);
    }
}
