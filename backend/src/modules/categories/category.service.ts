import { AppDataSource } from '../../config/data.source';
import { Category } from './category.entity';
import { ApiError } from '../../common/middlewares/error.middleware';

const DEFAULT_CATEGORIES = [
    { name: 'Food & Dining', icon: '🍔', color: '#f97316' },
    { name: 'Transport', icon: '🚗', color: '#3b82f6' },
    { name: 'Groceries', icon: '🛒', color: '#22c55e' },
    { name: 'Health & Medical', icon: '🏥', color: '#ef4444' },
    { name: 'Entertainment', icon: '🎬', color: '#a855f7' },
    { name: 'Shopping', icon: '🛍️', color: '#ec4899' },
    { name: 'Utilities & Bills', icon: '💡', color: '#eab308' },
    { name: 'Subscriptions', icon: '📱', color: '#06b6d4' },
    { name: 'Travel', icon: '✈️', color: '#0ea5e9' },
    { name: 'Rent & Housing', icon: '🏠', color: '#64748b' },
    { name: 'Education', icon: '📚', color: '#8b5cf6' },
    { name: 'Maintenance', icon: '🔧', color: '#78716c' },
    { name: 'Family', icon: '👨‍👩‍👧', color: '#f43f5e' },
    { name: 'Gifts & Donations', icon: '🎁', color: '#d946ef' },
    { name: 'Other', icon: '📦', color: '#94a3b8' },
];

export class CategoryService {
    private repo = AppDataSource.getRepository(Category);
    private static cache: Category[] | null = null;
    private static cacheTime: number = 0;
    private readonly CACHE_TTL = 1000 * 60 * 60; // 1 hour

    async getAll() {
        if (CategoryService.cache && Date.now() - CategoryService.cacheTime < this.CACHE_TTL) {
            return CategoryService.cache;
        }
        CategoryService.cache = await this.repo.find({ order: { isDefault: 'DESC', name: 'ASC' } });
        CategoryService.cacheTime = Date.now();
        return CategoryService.cache;
    }

    async getById(id: string) {
        const category = await this.repo.findOneBy({ id });
        if (!category) throw new ApiError('Category not found', 404);
        return category;
    }

    create(data: Partial<Category>) {
        const category = this.repo.create(data);
        CategoryService.cache = null;
        return this.repo.save(category);
    }

    async update(id: string, data: Partial<Category>) {
        const category = await this.getById(id);
        Object.assign(category, data);
        CategoryService.cache = null;
        return this.repo.save(category);
    }

    async delete(id: string) {
        const category = await this.getById(id);
        CategoryService.cache = null;
        await this.repo.remove(category);
    }

    async seedDefaults() {
        const existing = await this.repo.find();
        if (existing.length > 0) {
            return { message: 'Categories already seeded', count: existing.length };
        }

        const categories = this.repo.create(
            DEFAULT_CATEGORIES.map((c) => ({ ...c, isDefault: true })),
        );
        const saved = await this.repo.save(categories);
        CategoryService.cache = null;
        return { message: 'Default categories seeded', count: saved.length };
    }
}
