import { MoreThanOrEqual } from 'typeorm';
import { AppDataSource } from '../../config/data.source';
import { getISTDateString } from '../../common/utils/date.utils';
import { Expense } from './expense.entity';
import { MerchantRule } from '../merchants/merchant-rule.entity';
import { Category } from '../categories/category.entity';
import { addDays } from './missed-habits';

// The spelling of the names this speaker actually uses in EXPENSES — shops, categories and the words that keep showing
// up in their expenses (people and the lent/returned ledger are a separate flow and are deliberately left out) — so a speech model writes "Alfaham" (known) instead of a phonetic guess like "Alfan".

const LOOKBACK_DAYS = 180;
const MAX_FREQUENT = 80;
const MAX_TERMS = 150;
const CACHE_MS = 10 * 60 * 1000;
const COMMON = new Set(['from', 'and', 'the', 'for', 'with', 'new', 'old', 'other', 'bill', 'paid', 'pay']);

let cache: { at: number; terms: string[] } | null = null;

export function clearSpeechVocabularyCache(): void {
    cache = null;
}

export async function loadSpeechVocabulary(): Promise<string[]> {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.terms;
    try {
        const since = addDays(getISTDateString().slice(0, 10), -LOOKBACK_DAYS);
        const [rules, categories, expenses] = await Promise.all([
            AppDataSource.getRepository(MerchantRule).find(),
            AppDataSource.getRepository(Category).find(),
            AppDataSource.getRepository(Expense).find({ where: { date: MoreThanOrEqual(since) }, select: { description: true, note: true } }),
        ]);

        // Names first (they matter most), then the most frequent words of recent expenses.
        const named = [
            ...rules.flatMap((r) => [r.name, ...(r.aliases ?? [])]),
            ...categories.map((c) => c.name),
        ];
        const counts = new Map<string, { n: number; forms: Map<string, number> }>();
        for (const e of expenses) {
            for (const word of `${e.description ?? ''} ${e.note ?? ''}`.match(/[A-Za-z][A-Za-z'’]{2,}/g) ?? []) {
                const key = word.toLowerCase();
                if (COMMON.has(key)) continue;
                const entry = counts.get(key) ?? { n: 0, forms: new Map() };
                entry.n++;
                entry.forms.set(word, (entry.forms.get(word) ?? 0) + 1);
                counts.set(key, entry);
            }
        }
        const frequent = [...counts.values()]
            .filter((c) => c.n >= 2)
            .sort((a, b) => b.n - a.n)
            .slice(0, MAX_FREQUENT)
            .map((c) => [...c.forms.entries()].sort((a, b) => b[1] - a[1])[0][0]); // the spelling the user (or the AI) used most

        const seen = new Set<string>();
        const terms: string[] = [];
        for (const t of [...named, ...frequent]) {
            const term = t.trim();
            const key = term.toLowerCase();
            if (term.length < 2 || term.length > 40 || seen.has(key)) continue;
            seen.add(key);
            terms.push(term);
            if (terms.length >= MAX_TERMS) break;
        }
        cache = { at: Date.now(), terms };
        return terms;
    } catch (err) {
        // A failed lookup only means no spelling hints.
        console.error(JSON.stringify({ level: 'error', ts: new Date().toISOString(), msg: 'speech vocabulary: lookup failed', error: String(err) }));
        return [];
    }
}
