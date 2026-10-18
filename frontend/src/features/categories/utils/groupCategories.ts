import type { Category, CategoryGroup } from '../types';

export const FALLBACK_GROUP = 'Other';

// First matching rule wins, so specific ones (petrol, recharge, movie) sit above "family".
const GROUP_RULES: { label: string; keywords: string[] }[] = [
  { label: 'Fuel', keywords: ['petrol', 'fuel', 'diesel'] },
  { label: 'Travel & Transport', keywords: ['transport', 'railway', 'train', 'bus', 'cab', 'taxi', 'trip', 'travel'] },
  { label: 'Bills & Utilities', keywords: ['recharge', 'electricity', 'water', 'bill', 'rent', 'housing', 'maintenance', 'internet', 'subscription'] },
  { label: 'Entertainment', keywords: ['movie', 'entertainment', 'game'] },
  { label: 'Groceries', keywords: ['grocer'] },
  { label: 'Food & Drinks', keywords: ['food', 'dining', 'tea', 'snack', 'drink', 'chocolate', 'coffee'] },
  { label: 'Shopping & Personal', keywords: ['dress', 'cloth', 'electronic', 'shopping', 'hair', 'gift'] },
  { label: 'Health', keywords: ['health', 'medical', 'education'] },
  { label: 'Family', keywords: ['family'] },
];

// Suggests a group from the name; only returns groups that still exist.
export function guessGroup(name: string, groups: CategoryGroup[]): string {
  const n = name.toLowerCase();
  const label = GROUP_RULES.find((g) => g.keywords.some((k) => n.includes(k)))?.label;
  return label && groups.some((g) => g.name === label) ? label : FALLBACK_GROUP;
}

export function groupOf(category: Category, groups: CategoryGroup[]): string {
  const saved = category.groupName;
  return saved && groups.some((g) => g.name === saved) ? saved : guessGroup(category.name, groups);
}

export function groupCategories(categories: Category[], groups: CategoryGroup[]): [string, Category[]][] {
  const map = new Map<string, Category[]>();
  for (const c of categories) {
    const g = groupOf(c, groups);
    map.set(g, [...(map.get(g) ?? []), c]);
  }
  // Alphabetical, with the catch-all "Other" always last.
  return [...map.keys()]
    .sort((a, b) =>
      a === FALLBACK_GROUP ? 1 : b === FALLBACK_GROUP ? -1 : a.localeCompare(b),
    )
    .map((g) => [g, map.get(g)!.sort((a, b) => a.name.localeCompare(b.name))]);
}
