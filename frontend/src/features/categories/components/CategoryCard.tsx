import { Link } from 'react-router-dom';
import type { Category } from '../types';

interface CategoryCardProps {
  category: Category;
}

export default function CategoryCard({ category }: CategoryCardProps) {
  return (
    <Link
      to={`/categories/${category.id}/edit`}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl border border-border bg-card active:opacity-60 transition-opacity"
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-xl shrink-0"
        style={{ backgroundColor: category.color }}
      >
        {category.icon}
      </div>
      <span className="text-sm font-medium truncate">{category.name}</span>
    </Link>
  );
}
