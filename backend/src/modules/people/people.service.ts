import { AppDataSource } from '../../config/data.source';
import { Person } from './person.entity';
import { DebtTransaction, DebtType } from './debt-transaction.entity';
import { ApiError } from '../../common/middlewares/error.middleware';

export class PeopleService {
    private personRepo = AppDataSource.getRepository(Person);
    private transactionRepo = AppDataSource.getRepository(DebtTransaction);

    async getAll() {
        const people = await this.personRepo.find({
            relations: ['transactions'],
            order: { name: 'ASC' }
        });

        return people.map(p => {
            const balance = p.transactions.reduce((acc, t) => {
                const amount = Number(t.amount);
                return t.type === 'GIVEN' ? acc + amount : acc - amount;
            }, 0);
            
            // Remove transactions from summary for lighter weight
            const { transactions, ...rest } = p;
            return {
                ...rest,
                balance: Math.round(balance * 100) / 100
            };
        });
    }

    async getById(id: string) {
        const person = await this.personRepo.findOne({
            where: { id },
            relations: ['transactions'],
        });
        
        if (!person) throw new ApiError('Person not found', 404);

        const balance = person.transactions.reduce((acc, t) => {
            const amount = Number(t.amount);
            return t.type === 'GIVEN' ? acc + amount : acc - amount;
        }, 0);

        // Sort transactions by date descending
        person.transactions.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.getTime() - a.createdAt.getTime());

        return {
            ...person,
            balance: Math.round(balance * 100) / 100
        };
    }

    async createPerson(data: Partial<Person>) {
        if (data.phoneNumber) {
            const existing = await this.personRepo.findOneBy({ phoneNumber: data.phoneNumber });
            if (existing) {
                // If name changed, update it to the latest version found
                if (data.name && existing.name !== data.name) {
                    existing.name = data.name;
                    return this.personRepo.save(existing);
                }
                return existing;
            }
        }
        const person = this.personRepo.create(data);
        return this.personRepo.save(person);
    }

    async updatePerson(id: string, data: Partial<Person>) {
        const person = await this.personRepo.findOneBy({ id });
        if (!person) throw new ApiError('Person not found', 404);
        Object.assign(person, data);
        return this.personRepo.save(person);
    }

    async deletePerson(id: string) {
        const person = await this.personRepo.findOneBy({ id });
        if (!person) throw new ApiError('Person not found', 404);
        await this.personRepo.remove(person);
    }

    async addTransaction(personId: string, data: { amount: number; type: DebtType; date: string; note?: string }) {
        const person = await this.personRepo.findOneBy({ id: personId });
        if (!person) throw new ApiError('Person not found', 404);

        const transaction = this.transactionRepo.create({
            ...data,
            personId
        });
        return this.transactionRepo.save(transaction);
    }

    async deleteTransaction(id: string) {
        const transaction = await this.transactionRepo.findOneBy({ id });
        if (!transaction) throw new ApiError('Transaction not found', 404);
        await this.transactionRepo.remove(transaction);
    }
}
