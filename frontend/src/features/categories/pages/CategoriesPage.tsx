import { Plus, Tag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCategoriesQuery, useSeedCategories } from '../hooks/useCategories';
import CategoryCard from '../components/CategoryCard';
import EmptyState from '@/components/EmptyState';

export default function CategoriesPage() {
  const { data: categories = [], isLoading } = useCategoriesQuery();
  const seed = useSeedCategories();

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

      <div className="page-content">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 bg-card rounded-2xl animate-pulse border border-border" />
            ))}
          </div>
        ) : categories.length === 0 ? (
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
        ) : (
          <div className="space-y-2">
            {categories.map((cat) => (
              <CategoryCard key={cat.id} category={cat} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
