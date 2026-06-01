import { useEffect, useRef, useState } from 'react';
import { Search, X, Check, ChevronsUpDown } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { useCategoriesQuery } from '@/features/categories/hooks/useCategories';
import { useSwipeGesture } from '@/context/SwipeGestureContext';

interface ExpenseFilterProps {
  isOpen: boolean;
  onClose: () => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  selectedCategoryIds: string[];
  onCategoryToggle: (id: string) => void;
  onClearFilters: () => void;
  onClearCategories: () => void;
}

export default function ExpenseFilter({
  isOpen,
  searchTerm,
  onSearchChange,
  selectedCategoryIds,
  onCategoryToggle,
  onClearFilters,
  onClearCategories,
}: ExpenseFilterProps) {
  const { data: categories = [] } = useCategoriesQuery();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { disableGlobalSwipe, enableGlobalSwipe } = useSwipeGesture();

  const modalRef = useRef<HTMLDivElement>(null);
  const handlePointerStartY = useRef<number | null>(null);
  const handleCurrentY = useRef<number>(0);

  const onHandlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    handlePointerStartY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onHandlePointerMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (handlePointerStartY.current === null || !modalRef.current) return;
    let distance = e.clientY - handlePointerStartY.current;
    if (distance < 0) distance = 0;
    handleCurrentY.current = distance;
    modalRef.current.style.transition = 'none';
    modalRef.current.style.transform = `translateY(${distance}px)`;
  };

  const onHandlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (handlePointerStartY.current === null || !modalRef.current) return;
    if (handleCurrentY.current > 120) {
      setSheetOpen(false);
    } else {
      modalRef.current.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
      modalRef.current.style.transform = 'translateY(0px)';
    }
    handlePointerStartY.current = null;
    handleCurrentY.current = 0;
  };

  const hasActiveFilters = !!(searchTerm || selectedCategoryIds.length > 0);

  useEffect(() => {
    if (!isOpen || selectedCategoryIds.length === 0) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`category-filter-${selectedCategoryIds[0]}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div
        data-filter-panel
        data-no-swipe
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onPointerEnter={disableGlobalSwipe}
        onPointerLeave={enableGlobalSwipe}
        onTouchStart={(e) => {
          e.stopPropagation();
          disableGlobalSwipe();
        }}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => {
          e.stopPropagation();
          enableGlobalSwipe();
        }}
        onTouchCancel={(e) => {
          e.stopPropagation();
          enableGlobalSwipe();
        }}
        className="overflow-hidden border-b border-border transition-all duration-300 ease-in-out"
        style={{
          maxHeight: isOpen ? '400px' : '0',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="bg-card/50 px-4 py-4 space-y-4">
          {/* Header row with label + clear */}
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Search & Filter
            </h3>
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
              <button
                onClick={() => setSheetOpen(true)}
                className="flex items-center gap-1 text-xs text-primary font-medium px-1.5 py-0.5"
              >
                {selectedCategoryIds.length > 1
                  ? `${selectedCategoryIds.length} selected`
                  : selectedCategoryIds.length === 1
                    ? '1 selected'
                    : 'All'}
                <ChevronsUpDown className="w-3 h-3" />
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto overscroll-x-contain disable-scrollbars pb-1">
              <button
                id="category-filter-all"
                onClick={() => selectedCategoryIds.length > 0 && onClearCategories()}
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

      {/* Category picker bottom sheet */}
      <Dialog.Root open={sheetOpen} onOpenChange={setSheetOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-500 ease-in-out" />
          <Dialog.Content
            ref={modalRef}
            data-filter-panel
            className="fixed bottom-0 inset-x-0 w-full sm:max-w-md sm:mx-auto z-50 bg-card border-t border-border rounded-t-3xl max-h-[80vh] flex flex-col duration-500 ease-in-out data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom sheet-exit"
          >
            {/* Drag handle */}
            <div
              onPointerDown={onHandlePointerDown}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              onPointerCancel={onHandlePointerUp}
              className="pt-2 pb-3 w-full flex justify-center cursor-grab active:cursor-grabbing touch-none select-none flex-shrink-0"
            >
              <div className="w-10 h-1 bg-border rounded-full pointer-events-none" />
            </div>

            <div className="px-4 pt-2 pb-3 border-b border-border flex-shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold">Select Categories</span>
                {selectedCategoryIds.length > 0 && (
                  <button
                    onClick={onClearCategories}
                    className="text-xs text-muted-foreground px-2 py-1"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain disable-scrollbars px-4 pt-3 pb-4">
              {/* All option — full width */}
              <button
                onClick={() => selectedCategoryIds.length > 0 && onClearCategories()}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors mb-3
                  ${selectedCategoryIds.length === 0
                    ? 'bg-primary/10 text-primary'
                    : 'bg-secondary text-foreground active:opacity-70'}`}
              >
                <span>All categories</span>
                {selectedCategoryIds.length === 0 && <Check className="w-4 h-4" />}
              </button>

              {/* 2-column icon grid */}
              <div className="grid grid-cols-2 gap-2">
                {categories.map((cat) => {
                  const active = selectedCategoryIds.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      onClick={() => onCategoryToggle(cat.id)}
                      className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border transition-colors
                        ${active
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-secondary/50 active:opacity-70'}`}
                    >
                      {active && (
                        <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-primary-foreground" />
                        </span>
                      )}
                      <span
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                        style={{ backgroundColor: cat.color }}
                      >
                        {cat.icon}
                      </span>
                      <span className={`text-xs font-medium text-center leading-tight ${active ? 'text-primary' : 'text-foreground'}`}>
                        {cat.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
