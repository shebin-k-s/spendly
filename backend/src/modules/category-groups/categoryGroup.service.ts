import { AppDataSource } from '../../config/data.source';
import { ApiError } from '../../common/middlewares/error.middleware';
import { CategoryGroup } from './categoryGroup.entity';
import { Category } from '../categories/category.entity';
import { CategoryService } from '../categories/category.service';

export const FALLBACK_GROUP = 'Other';

const DEFAULT_GROUPS = [
    'Transport & Fuel',
    'Bills & Home',
    'Entertainment',
    'Food & Groceries',
    'Shopping & Personal',
    'Health & Education',
    'Family',
    FALLBACK_GROUP,
];

const clean = (name: string) => name.trim().replace(/\s+/g, ' ');

export class CategoryGroupService {
    private repo = AppDataSource.getRepository(CategoryGroup);
    private categories = AppDataSource.getRepository(Category);

    async getAll() {
        if ((await this.repo.count()) === 0) {
            await this.repo.save(
                this.repo.create(DEFAULT_GROUPS.map((name, i) => ({ name, sortOrder: i }))),
            );
        }
        return this.repo.find({ order: { sortOrder: 'ASC', name: 'ASC' } });
    }

    async findByName(name: string) {
        return this.repo
            .createQueryBuilder('g')
            .where('LOWER(g.name) = LOWER(:name)', { name: clean(name) })
            .getOne();
    }

    private async assertUnique(name: string, exceptId?: string) {
        const existing = await this.findByName(name);
        if (existing && existing.id !== exceptId) {
            throw new ApiError(`Group "${existing.name}" already exists`, 409);
        }
    }

    private async getById(id: string) {
        const group = await this.repo.findOneBy({ id });
        if (!group) throw new ApiError('Group not found', 404);
        return group;
    }

    async create(rawName: string) {
        const name = clean(rawName);
        await this.assertUnique(name);
        const last = await this.repo.find({ order: { sortOrder: 'DESC' }, take: 1 });
        return this.repo.save(this.repo.create({ name, sortOrder: (last[0]?.sortOrder ?? -1) + 1 }));
    }

    async update(id: string, rawName: string) {
        const group = await this.getById(id);
        if (group.name === FALLBACK_GROUP) throw new ApiError(`"${FALLBACK_GROUP}" cannot be renamed`, 400);
        const name = clean(rawName);
        if (name.toLowerCase() === FALLBACK_GROUP.toLowerCase()) {
            throw new ApiError(`"${FALLBACK_GROUP}" is reserved`, 400);
        }
        await this.assertUnique(name, id);

        const oldName = group.name;
        group.name = name;
        await AppDataSource.transaction(async (m) => {
            await m.save(group);
            await m.update(Category, { groupName: oldName }, { groupName: name });
        });
        CategoryService.clearCache();
        return group;
    }

    async delete(id: string) {
        const group = await this.getById(id);
        if (group.name === FALLBACK_GROUP) throw new ApiError(`"${FALLBACK_GROUP}" cannot be deleted`, 400);
        await AppDataSource.transaction(async (m) => {
            await m.update(Category, { groupName: group.name }, { groupName: FALLBACK_GROUP });
            await m.remove(group);
        });
        CategoryService.clearCache();
    }
}
