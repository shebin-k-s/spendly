import * as React from 'react';
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Search, X, Tag, Check } from 'lucide-react';
import { useCategoriesQuery } from '../hooks/useCategories';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { cn } from '@/lib/utils';

interface CategoryPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds?: string[];
  onSelect: (categoryId: string, categoryName: string) => void;
  onClear?: () => void;
  title?: string;
  multiSelect?: boolean;
}

export function CategoryPicker({
  open,
  onOpenChange,
  selectedIds = [],
  onSelect,
  onClear,
  title = "Select Categories",
  multiSelect = false,
}: CategoryPickerProps) {
  const [search, setSearch] = useState('');
  const { data: categories = [] } = useCategoriesQuery();

  const filtered = categories.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      maxHeight="75vh"
      header={(
        <div className="flex items-center justify-between w-full pr-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <Dialog.Title className="text-base font-bold">{title}</Dialog.Title>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest leading-none mt-0.5">Categorize your spending</p>
            </div>
          </div>
          {multiSelect && selectedIds.length > 0 && onClear && (
            <button
              onClick={onClear}
              className="text-xs font-bold text-muted-foreground bg-secondary px-3 py-1 rounded-lg active:scale-95 transition-all"
            >
              Clear
            </button>
          )}
        </div>
      )}
    >
      <div className="px-4 pb-10 space-y-4 min-h-[60vh] flex flex-col">
        <div className="relative mt-2">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            placeholder="Search categories..."
            className="w-full bg-secondary border border-border rounded-xl pl-10 pr-10 py-2.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary transition-all [&::-webkit-search-cancel-button]:hidden"
            value={search}
            enterKeyHint="search"
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto disable-scrollbars pb-6">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center opacity-50 space-y-3">
              <p className="text-sm font-medium">No categories matching "{search}"</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {multiSelect && !search && (
                <button
                  onClick={() => selectedIds.length > 0 && onClear?.()}
                  className={cn(
                    "col-span-2 flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors mb-2",
                    selectedIds.length === 0
                      ? "bg-primary/10 text-primary"
                      : "bg-secondary text-foreground active:opacity-70"
                  )}
                >
                  <span>All categories</span>
                  {selectedIds.length === 0 && <Check className="w-4 h-4" />}
                </button>
              )}

              {filtered.map(cat => {
                const active = selectedIds.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      onSelect(cat.id, cat.name);
                      if (!multiSelect) onOpenChange(false);
                    }}
                    className={cn(
                      "relative flex flex-col items-center gap-2 p-4 rounded-2xl border transition-colors",
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border bg-secondary/50 active:opacity-70"
                    )}
                  >
                    {active && (
                      <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center animate-in zoom-in duration-300">
                        <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />
                      </span>
                    )}
                    <span
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                      style={{ backgroundColor: cat.color }}
                    >
                      {cat.icon}
                    </span>
                    <span className={cn(
                      "text-xs font-medium text-center leading-tight truncate w-full",
                      active ? "text-primary font-bold" : "text-foreground"
                    )}>
                      {cat.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
