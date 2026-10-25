import { MoreThanOrEqual } from 'typeorm';
import { AppDataSource } from '../../config/data.source';
import { getISTDateString } from '../../common/utils/date.utils';
import { Expense } from './expense.entity';
import { MerchantRule } from '../merchants/merchant-rule.entity';
import { Category } from '../categories/category.entity';
import { Person } from '../people/person.entity';
import { DebtTransaction } from '../people/debt-transaction.entity';
import { addDays } from './missed-habits';

// The spelling of the names this speaker actually uses, so a speech model writes "Alfaham" (known) instead of a
// phonetic guess like "Alfan". Expenses and lending are separate flows and get separate lists:
//  - expense: shops, categories and the words that keep showing up in expense descriptions/notes
//  - lending: the people in the lent/returned ledger and the words of their transaction notes

export type VocabScope = 'expense' | 'lending';

const LOOKBACK_DAYS = 180;
const MAX_FREQUENT = 80;
const MAX_TERMS = 150;
const CACHE_MS = 10 * 60 * 1000;
const COMMON = new Set(['from', 'and', 'the', 'for', 'with', 'new', 'old', 'other', 'bill', 'paid', 'pay']);

const caches = new Map<VocabScope, { at: number; terms: string[] }>();

export function clearSpeechVocabularyCache(): void {
    caches.clear();
}

// Words that appear at least twice in the texts, most frequent first, in the spelling used most.
function frequentWords(texts: string[]): string[] {
    const counts = new Map<string, { n: number; forms: Map<string, number> }>();
    for (const text of texts) {
        for (const word of text.match(/[A-Za-z][A-Za-z'’]{2,}/g) ?? []) {
            const key = word.toLowerCase();
            if (COMMON.has(key)) continue;
            const entry = counts.get(key) ?? { n: 0, forms: new Map() };
            entry.n++;
            entry.forms.set(word, (entry.forms.get(word) ?? 0) + 1);
            counts.set(key, entry);
        }
    }
    return [...counts.values()]
        .filter((c) => c.n >= 2)
        .sort((a, b) => b.n - a.n)
        .slice(0, MAX_FREQUENT)
        .map((c) => [...c.forms.entries()].sort((a, b) => b[1] - a[1])[0][0]);
}

async function collect(scope: VocabScope, since: string): Promise<{ named: string[]; texts: string[] }> {
    if (scope === 'lending') {
        const [people, transactions] = await Promise.all([
            AppDataSource.getRepository(Person).find(),
            AppDataSource.getRepository(DebtTransaction).find({ where: { date: MoreThanOrEqual(since) }, select: { note: true } }),
        ]);
        return { named: people.map((p) => p.name), texts: transactions.map((t) => t.note ?? '') };
    }
    const [rules, categories, expenses] = await Promise.all([
        AppDataSource.getRepository(MerchantRule).find(),
        AppDataSource.getRepository(Category).find(),
        AppDataSource.getRepository(Expense).find({ where: { date: MoreThanOrEqual(since) }, select: { description: true, note: true } }),
    ]);
    return {
        named: [...rules.flatMap((r) => [r.name, ...(r.aliases ?? [])]), ...categories.map((c) => c.name)],
        texts: expenses.map((e) => `${e.description ?? ''} ${e.note ?? ''}`),
    };
}

export async function loadSpeechVocabulary(scope: VocabScope = 'expense'): Promise<string[]> {
    const hit = caches.get(scope);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.terms;
    try {
        const since = addDays(getISTDateString().slice(0, 10), -LOOKBACK_DAYS);
        const { named, texts } = await collect(scope, since);

        // Names first (they matter most), then the most frequent words.
        const seen = new Set<string>();
        const terms: string[] = [];
        for (const t of [...named, ...frequentWords(texts)]) {
            const term = t.trim();
            const key = term.toLowerCase();
            if (term.length < 2 || term.length > 40 || seen.has(key)) continue;
            seen.add(key);
            terms.push(term);
            if (terms.length >= MAX_TERMS) break;
        }
        caches.set(scope, { at: Date.now(), terms });
        return terms;
    } catch (err) {
        // A failed lookup only means no spelling hints.
        console.error(JSON.stringify({ level: 'error', ts: new Date().toISOString(), msg: 'speech vocabulary: lookup failed', scope, error: String(err) }));
        return [];
    }
}
