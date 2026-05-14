import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Category } from '../types';
import { useDeleteCategory } from '../hooks/useCategories';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

interface CategoryCardProps {
  category: Category;
}

export default function CategoryCard({ category }: CategoryCardProps) {
  const deleteCategory = useDeleteCategory();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  return (
    <div className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-3">
      {/* Color accent bar */}
      <div
        className="w-1 h-10 rounded-full shrink-0"
        style={{ backgroundColor: category.color }}
      />

      {/* Icon */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
        style={{ backgroundColor: category.color }}
      >
        {category.icon}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{category.name}</p>
        {category.isDefault && (
          <p className="text-[10px] text-muted-foreground mt-0.5">Default</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Link
          to={`/categories/${category.id}/edit`}
          className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center active:opacity-60 transition-opacity"
        >
          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
        </Link>
        <button
          onClick={() => setShowDeleteModal(true)}
          disabled={deleteCategory.isPending}
          className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive
                     active:opacity-60 transition-opacity"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <ConfirmModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        title="Delete Category"
        description={`Delete "${category.name}"? Expenses using it won't be deleted.`}
        onConfirm={() => deleteCategory.mutate(category.id)}
      />
    </div>
  );
}
