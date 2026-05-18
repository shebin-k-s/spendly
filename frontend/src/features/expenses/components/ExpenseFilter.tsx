import { useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { useCategoriesQuery } from '@/features/categories/hooks/useCategories';

interface ExpenseFilterProps {
  isOpen: boolean;
  onClose: () => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  selectedCategoryIds: string[];
  onCategoryToggle: (id: string) => void;
  onClearFilters: () => void;
}

export default function ExpenseFilter({
  isOpen,
  onClose,
  searchTerm,
  onSearchChange,
  selectedCategoryIds,
  onCategoryToggle,
  onClearFilters,
}: ExpenseFilterProps) {
  const { data: categories = [] } = useCategoriesQuery();

  const hasActiveFilters = searchTerm || selectedCategoryIds.length > 0;

  useEffect(() => {
    if (!isOpen || selectedCategoryIds.length === 0) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`category-filter-${selectedCategoryIds[0]}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="overflow-hidden border-b border-border transition-all duration-300 ease-in-out"
      style={{
        maxHeight: isOpen ? '400px' : '0',
        opacity: isOpen ? 1 : 0,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onTouchCancel={(e) => e.stopPropagation()}
    >
      <div className="bg-card/50 px-4 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Filter Transactions</h3>
          {hasActiveFilters && (
            <button onClick={onClearFilters} className="text-xs text-muted-foreground px-2 py-1">
              Clear all
            </button>
          )}
        </div>

        {/* Search */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          }}
          className="relative"
        >
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            enterKeyHint="done"
            placeholder="Search description or note..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-secondary text-secondary-foreground rounded-xl py-2 pl-9 pr-10 text-sm outline-none focus:ring-1 focus:ring-primary transition-all [&::-webkit-search-cancel-button]:hidden"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-muted-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>

        {/* Category multi-select */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Category
            </label>
            {selectedCategoryIds.length > 1 && (
              <span className="text-xs text-primary font-medium">
                {selectedCategoryIds.length} selected
              </span>
            )}
          </div>
          <div
            className="flex gap-2 overflow-x-auto overscroll-x-contain disable-scrollbars pb-1"
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onTouchCancel={(e) => e.stopPropagation()}
          >
            <button
              id="category-filter-all"
              onClick={() => selectedCategoryIds.length > 0 && onClearFilters()}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap
                ${selectedCategoryIds.length === 0
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground'}`}
            >
              All
            </button>
            {categories.map((cat) => {
              const active = selectedCategoryIds.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  id={`category-filter-${cat.id}`}
                  onClick={() => onCategoryToggle(cat.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap
                    ${active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
