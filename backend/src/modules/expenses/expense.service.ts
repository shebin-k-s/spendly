import { AppDataSource } from '../../config/data.source';
import { Expense } from './expense.entity';
import { MonthlyAiInsight } from './monthly-ai-insight.entity';
import { MissedDismissal } from './missed-dismissal.entity';
import { MissedCursor } from './missed-cursor.entity';
import { ApiError } from '../../common/middlewares/error.middleware';
import { getISTParts } from '../../common/utils/date.utils';

// Module-level so it's shared even if ExpenseService is instantiated more than once.
let lastMissedPruneDate: string | null = null;

export class ExpenseService {
    private repo = AppDataSource.getRepository(Expense);
    private insightRepo = AppDataSource.getRepository(MonthlyAiInsight);
    private dismissalRepo = AppDataSource.getRepository(MissedDismissal);
    private cursorRepo = AppDataSource.getRepository(MissedCursor);

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

    async getByDateRange(start: string, end: string) {
        return this.repo
            .createQueryBuilder('expense')
            .leftJoinAndSelect('expense.category', 'category')
            .where('expense.date >= :start AND expense.date <= :end', { start, end })
            .getMany();
    }

    async getByCategoryRange(categoryId: string, start: string, end: string) {
        const expenses = await this.repo
            .createQueryBuilder('expense')
            .leftJoinAndSelect('expense.category', 'category')
            .where('category.id = :categoryId', { categoryId })
            .andWhere('expense.date >= :start AND expense.date <= :end', { start, end })
            .getMany();

        expenses.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));

        const monthlyMap = new Map<string, { year: number; month: number; total: number; cashbackTotal: number; count: number }>();
        let total = 0;
        let cashbackTotal = 0;

        for (const expense of expenses) {
            const year = Number(expense.date.slice(0, 4));
            const month = Number(expense.date.slice(5, 7));
            const key = `${year}-${month}`;
            if (!monthlyMap.has(key)) {
                monthlyMap.set(key, { year, month, total: 0, cashbackTotal: 0, count: 0 });
            }
            const bucket = monthlyMap.get(key)!;
            const amount = Number(expense.amount);
            const cashback = Number(expense.cashback || 0);
            bucket.total += amount;
            bucket.cashbackTotal += cashback;
            bucket.count += 1;
            total += amount;
            cashbackTotal += cashback;
        }

        const monthly = Array.from(monthlyMap.values())
            .map((m) => ({
                ...m,
                total: Math.round(m.total * 100) / 100,
                cashbackTotal: Math.round(m.cashbackTotal * 100) / 100,
            }))
            .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));

        return {
            start,
            end,
            total: Math.round(total * 100) / 100,
            cashbackTotal: Math.round(cashbackTotal * 100) / 100,
            count: expenses.length,
            monthly,
            expenses,
        };
    }

    // Returns the cached points only if they were generated from these exact
    // numbers — otherwise null, so the caller knows to ask the AI again.
    // A row surviving from an earlier, differently-shaped cache format could
    // fail to parse — treat that the same as a miss rather than erroring.
    async getCachedInsight(year: number, month: number, inputHash: string): Promise<{ points: string[]; generatedAt: Date } | null> {
        const row = await this.insightRepo.findOneBy({ year, month });
        if (!row || row.inputHash !== inputHash) return null;
        try {
            const parsed = JSON.parse(row.points);
            return Array.isArray(parsed) ? { points: parsed, generatedAt: row.generatedAt } : null;
        } catch {
            return null;
        }
    }

    async saveInsight(year: number, month: number, inputHash: string, points: string[]): Promise<Date> {
        let row = await this.insightRepo.findOneBy({ year, month });
        if (!row) row = this.insightRepo.create({ year, month });
        row.inputHash = inputHash;
        row.points = JSON.stringify(points);
        const saved = await this.insightRepo.save(row);
        return saved.generatedAt;
    }

    async getMissedCursor(): Promise<string | null> {
        const row = await this.cursorRepo.findOneBy({ id: 'default' });
        return row?.date ?? null;
    }

    async getMissedDismissalKeys(sinceDate: string): Promise<Set<string>> {
        const rows = await this.dismissalRepo
            .createQueryBuilder('d')
            .where('d.date >= :sinceDate', { sinceDate })
            .getMany();
        return new Set(rows.map(r => `${r.date}::${r.categoryId}::${r.slotKey}`));
    }

    // Records resolved suggestions and optionally moves the cursor — never
    // backwards, and never to today or later (today always gets a fresh check).
    async resolveMissed(items: { date: string; categoryId: string; slotKey: string }[], cursorDate?: string) {
        const { dateString: today } = getISTParts();
        if (items.length) {
            await this.dismissalRepo
                .createQueryBuilder()
                .insert()
                .values(items)
                .orIgnore()
                .execute();
        }

        if (cursorDate && cursorDate < today) {
            const current = await this.getMissedCursor();
            if (!current || cursorDate > current) {
                await this.cursorRepo.save({ id: 'default', date: cursorDate });
            }
        }

        await this.pruneMissedDismissals(today);

        return { cursorDate: await this.getMissedCursor() };
    }

    // Dismissals older than the controller's 14-day backfill cap can never be
    // shown again, so they're dropped — but at most once per day, not on
    // every discard.
    private async pruneMissedDismissals(today: string) {
        if (lastMissedPruneDate === today) return;
        lastMissedPruneDate = today;
        const KEEP_DAYS = 15;
        const cutoff = new Date(`${today}T00:00:00Z`);
        cutoff.setUTCDate(cutoff.getUTCDate() - KEEP_DAYS);
        await this.dismissalRepo
            .createQueryBuilder()
            .delete()
            .where('date < :cutoff', { cutoff: cutoff.toISOString().slice(0, 10) })
            .execute();
    }

    async getAnalytics(months: number = 6) {
        const { year: nowYear, month: nowMonth } = getISTParts();
        const promises = [];

        for (let i = months - 1; i >= 0; i--) {
            const d = new Date(nowYear, (nowMonth - 1) - i, 1);
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
