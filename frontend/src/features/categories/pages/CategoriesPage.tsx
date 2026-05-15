import { useState } from 'react';
import { Plus, Search, Tag, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCategoriesQuery, useSeedCategories } from '../hooks/useCategories';
import CategoryCard from '../components/CategoryCard';
import EmptyState from '@/components/EmptyState';

export default function CategoriesPage() {
  const { data: raw = [], isLoading } = useCategoriesQuery();
  const seed = useSeedCategories();
  const [query, setQuery] = useState('');

  const sorted = [...raw].sort((a, b) => a.name.localeCompare(b.name));
  const categories = query.trim()
    ? sorted.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : sorted;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex-1">
          <h1 className="text-xl font-bold">Categories</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isLoading ? 'Loading...' : `${categories.length} categories`}
          </p>
        </div>
        <Link
          to="/categories/new"
          className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center"
        >
          <Plus className="w-4 h-4 text-primary-foreground" />
        </Link>
      </div>

      <div className="page-content space-y-4">
        {/* Search bar */}
        {!isLoading && sorted.length > 0 && (
          <form onSubmit={(e) => { e.preventDefault(); (e.currentTarget.querySelector('input') as HTMLInputElement)?.blur(); }} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search categories..."
              enterKeyHint="search"
              className="w-full bg-card border border-border rounded-2xl pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </form>
        )}

        {isLoading ? (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-14 w-36 bg-card rounded-2xl animate-pulse border border-border" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="No categories yet"
            description="Add custom categories or seed the defaults to get started."
            action={
              <button
                onClick={() => seed.mutate()}
                disabled={seed.isPending}
                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
              >
                {seed.isPending ? 'Seeding...' : 'Seed Default Categories'}
              </button>
            }
          />
        ) : categories.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No results"
            description={`No categories match "${query}".`}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <CategoryCard key={cat.id} category={cat} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
