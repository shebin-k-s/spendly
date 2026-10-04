import { AppDataSource } from '../../config/data.source';
import { MerchantRule } from './merchant-rule.entity';
import { Category } from '../categories/category.entity';
import { ApiError } from '../../common/middlewares/error.middleware';

type MerchantRulePayload = { name: string; aliases: string[]; categoryId: string };

export class MerchantRuleService {
    private repo = AppDataSource.getRepository(MerchantRule);
    private categoryRepo = AppDataSource.getRepository(Category);

    async getAll() {
        return this.repo.find({ relations: ['category'], order: { name: 'ASC' } });
    }

    async create(data: MerchantRulePayload) {
        await this.assertNameFree(data.name);
        const category = await this.getCategory(data.categoryId);
        const rule = this.repo.create({ name: data.name, aliases: this.cleanAliases(data.aliases, data.name), category });
        return this.repo.save(rule);
    }

    async update(id: string, data: MerchantRulePayload) {
        const rule = await this.repo.findOne({ where: { id }, relations: ['category'] });
        if (!rule) throw new ApiError('Shop rule not found', 404);
        await this.assertNameFree(data.name, id);
        rule.name = data.name;
        rule.aliases = this.cleanAliases(data.aliases, data.name);
        rule.category = await this.getCategory(data.categoryId);
        return this.repo.save(rule);
    }

    async delete(id: string) {
        const result = await this.repo.delete(id);
        if (!result.affected) throw new ApiError('Shop rule not found', 404);
    }

    private async getCategory(id: string) {
        const category = await this.categoryRepo.findOneBy({ id });
        if (!category) throw new ApiError('Category not found', 404);
        return category;
    }

    // Case-insensitive — "ayaans mart" and "Ayaans Mart" are the same shop.
    private async assertNameFree(name: string, exceptId?: string) {
        const existing = await this.repo
            .createQueryBuilder('r')
            .where('LOWER(r.name) = LOWER(:name)', { name })
            .getOne();
        if (existing && existing.id !== exceptId) throw new ApiError(`A rule for "${existing.name}" already exists`, 409);
    }

    // Drops blanks, case-insensitive duplicates, and anything equal to the name itself.
    private cleanAliases(aliases: string[], name: string) {
        const seen = new Set([name.toLowerCase()]);
        return aliases.filter(a => {
            const key = a.toLowerCase();
            if (!a || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
}
