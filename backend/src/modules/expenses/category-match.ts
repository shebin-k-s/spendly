// Safety net for when the model answers "no category": if the text contains every word of one of the user's
// category names ("abhi vehicle petrol" for a category "Abhi Petrol"), that category is the answer.

const STOP = new Set(['and', 'the', 'of', 'for', 'a', 'an', 'to']);
const GENERIC_NAMES = new Set(['other', 'others', 'misc', 'general', 'miscellaneous']);

// "petrols"/"petrol", "groceries"/"grocery" compare equal
const stem = (w: string): string => (w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
const words = (s: string): string[] => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !STOP.has(w)).map(stem);

export function matchCategoryByName<T extends { id: string; name: string }>(text: string, categories: T[]): T | null {
    const have = new Set(words(text));
    let best: T | null = null;
    let bestTokens = 0;
    let tied = false;
    for (const c of categories) {
        const tokens = words(c.name);
        if (!tokens.length || GENERIC_NAMES.has(tokens.join(' '))) continue;
        // a one-word category must be a real word, not a letter or two
        if (tokens.length === 1 && tokens[0].length < 4) continue;
        if (!tokens.every((t) => have.has(t))) continue;
        if (tokens.length > bestTokens) { best = c; bestTokens = tokens.length; tied = false; }
        else if (tokens.length === bestTokens) tied = true;
    }
    return tied ? null : best;
}
