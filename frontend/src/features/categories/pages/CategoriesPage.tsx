import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Check, ChevronDown, FolderPlus, Move, Plus, Search, Store, Tag, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCategoriesQuery, useSeedCategories, useUpdateCategory } from '../hooks/useCategories';
import { useQueryFreshness } from '@/hooks/useQueryFreshness';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import { DataFreshnessIndicator } from '@/components/DataFreshnessIndicator';
import CategoryCard from '../components/CategoryCard';
import { useLongPress } from '@/hooks/useLongPress';
import {
  useCategoryGroupsQuery,
  useCreateCategoryGroup,
  useUpdateCategoryGroup,
  useDeleteCategoryGroup,
} from '../hooks/useCategoryGroups';
import { FALLBACK_GROUP, groupCategories, groupOf } from '../utils/groupCategories';
import { blurOnEnter } from '@/utils/keyboard';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import type { Category, CategoryGroup } from '../types';
import EmptyState from '@/components/EmptyState';

// Tap folds the group; long-press opens rename/delete (the catch-all group can't be edited).
function GroupHeader({ label, count, open, locked, onToggle, onEdit }: {
  label: string;
  count: number;
  open: boolean;
  locked: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const press = useLongPress({ onLongPress: () => { if (!locked) onEdit(); }, onClick: onToggle });
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      {...press}
      onContextMenu={(e) => e.preventDefault()}
      className="flex items-center justify-between p-4 cursor-pointer"
    >
      <h2 className="text-base font-bold truncate">{label}</h2>
      <span className="flex items-center gap-2 shrink-0">
        <span className="text-xs font-medium text-muted-foreground bg-secondary rounded-full px-2.5 py-1">{count}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`} />
      </span>
    </div>
  );
}

const COLLAPSED_KEY = 'spendly_collapsed_category_groups';

export default function CategoriesPage() {
  const categoriesQuery = useCategoriesQuery();
  const { data: raw = [], isLoading } = categoriesQuery;
  const freshness = useQueryFreshness(categoriesQuery);
  useRefetchOnFocus(categoriesQuery);
  const seed = useSeedCategories();
  const { data: groups = [] } = useCategoryGroupsQuery();
  const createGroup = useCreateCategoryGroup();
  const updateGroup = useUpdateCategoryGroup();
  const deleteGroup = useDeleteCategoryGroup();
  const updateCategory = useUpdateCategory({ silent: true });
  const [moveMode, setMoveMode] = useState(false);
  const [dragCat, setDragCat] = useState<Category | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [overGroup, setOverGroup] = useState<string | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const scroller = useRef<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroup, setEditingGroup] = useState<{ id: string; name: string } | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<CategoryGroup | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]');
    } catch {
      return [];
    }
  });

  const toggleGroup = (label: string) => {
    const next = collapsed.includes(label) ? collapsed.filter((g) => g !== label) : [...collapsed, label];
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
    } catch { /* storage unavailable: fold state just won't persist */ }
  };

  const sorted = [...raw].sort((a, b) => a.name.localeCompare(b.name));
  const categories = query.trim()
    ? sorted.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : sorted;

  const groupAt = (x: number, y: number) =>
    document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-group-name]')?.dataset.groupName ?? null;

  const moveCategory = (cat: Category, to: string) => {
    const from = groupOf(cat, groups);
    const payload = { id: cat.id, name: cat.name, icon: cat.icon, color: cat.color };
    updateCategory.mutate({ ...payload, groupName: to }, {
      onSuccess: () => {
        toast.success(`Moved "${cat.name}" to ${to}`, {
          duration: 6000,
          action: { label: 'Undo', onClick: () => updateCategory.mutate({ ...payload, groupName: from }) },
        });
      },
      onError: () => toast.error('Could not move category'),
    });
  };

  const dragHandlers = {
    onDragStart: (cat: Category, x: number, y: number) => {
      pointer.current = { x, y };
      setDragPos({ x, y });
      setDragCat(cat);
      setOverGroup(groupAt(x, y));
      let el: HTMLElement | null = rootRef.current;
      while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement;
      scroller.current = el;
    },
    onDragMove: (x: number, y: number) => {
      pointer.current = { x, y };
      setDragPos({ x, y });
    },
    onDragEnd: (x: number, y: number, cancelled: boolean) => {
      const target = cancelled ? null : groupAt(x, y);
      const cat = dragCat;
      setDragCat(null);
      setOverGroup(null);
      if (cat && target && target !== groupOf(cat, groups)) moveCategory(cat, target);
    },
  };

  // While dragging, keep the highlighted group in sync and scroll when held near the screen edge.
  useEffect(() => {
    if (!dragCat) return;
    let raf = 0;
    const tick = () => {
      const { x, y } = pointer.current;
      const edge = 90;
      if (scroller.current) {
        if (y < edge) scroller.current.scrollTop -= 12;
        else if (y > window.innerHeight - edge) scroller.current.scrollTop += 12;
      }
      setOverGroup(groupAt(x, y));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dragCat]);

  const handleAddGroup = () => {
    if (!newGroupName.trim() || createGroup.isPending) return;
    (document.activeElement as HTMLElement | null)?.blur(); // closes the keyboard
    createGroup.mutate(newGroupName, {
      onSuccess: () => {
        setNewGroupName('');
        setAddingGroup(false);
      },
    });
  };

  const handleRenameGroup = () => {
    if (!editingGroup || !editingGroup.name.trim() || updateGroup.isPending) return;
    (document.activeElement as HTMLElement | null)?.blur(); // closes the keyboard
    const current = groups.find((g) => g.id === editingGroup.id)?.name;
    // Nothing changed: just close, don't hit the server.
    if (editingGroup.name.trim() === current) {
      setEditingGroup(null);
      return;
    }
    updateGroup.mutate(editingGroup, { onSuccess: () => setEditingGroup(null) });
  };

  // Empty groups stay visible (so a new group can be seen, renamed or deleted); a search hides them.
  const byName = new Map(groupCategories(categories, groups));
  const sections = [...groups]
    .sort((a, b) =>
      a.name === FALLBACK_GROUP ? 1 : b.name === FALLBACK_GROUP ? -1 : a.name.localeCompare(b.name),
    )
    .map((g) => ({ group: g, items: byName.get(g.name) ?? [] }))
    .filter((x) => !query.trim() || x.items.length > 0);

  return (
    <div ref={rootRef} className="animate-fade-in">
      <div className="page-header">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">Categories</h1>
            <DataFreshnessIndicator
              status={freshness.status}
              isFetching={freshness.isFetching}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isLoading ? 'Loading...' : `${categories.length} categories`}
          </p>
        </div>
        <button
          onClick={() => { setMoveMode((m) => !m); setDragCat(null); }}
          aria-label="Move categories between groups"
          aria-pressed={moveMode}
          className={`w-9 h-9 rounded-xl flex items-center justify-center ${moveMode ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
        >
          <Move className="w-4 h-4" />
        </button>
        <button
          onClick={() => setAddingGroup(true)}
          aria-label="New group"
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center"
        >
          <FolderPlus className="w-4 h-4" />
        </button>
        <Link
          to="/categories/shops"
          aria-label="Shops"
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center"
        >
          <Store className="w-4 h-4" />
        </Link>
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
              enterKeyHint="done"
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

        {moveMode && (
          <div className="flex items-center gap-3 rounded-2xl bg-primary/10 border border-primary/30 px-4 py-3">
            <Move className="w-4 h-4 text-primary shrink-0" />
            <p className="flex-1 text-xs">Move mode: hold a category, then drag it onto another group.</p>
            <button onClick={() => setMoveMode(false)} className="text-xs font-semibold text-primary">Done</button>
          </div>
        )}

        {addingGroup && (
          <div className="flex gap-2">
            <input
              autoFocus
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={blurOnEnter}
              placeholder="New group name"
              maxLength={40}
              enterKeyHint="done"
              className="form-input flex-1"
            />
            <button
              onClick={handleAddGroup}
              disabled={!newGroupName.trim() || createGroup.isPending}
              aria-label="Add group"
              className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center disabled:opacity-40"
            >
              <Check className="w-5 h-5 text-primary-foreground" />
            </button>
            <button
              onClick={() => { setAddingGroup(false); setNewGroupName(''); }}
              aria-label="Cancel"
              className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-4 gap-x-2 gap-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="w-14 h-14 rounded-full bg-secondary animate-pulse" />
                <div className="w-10 h-3 bg-secondary animate-pulse rounded" />
              </div>
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
          <div className="space-y-3">
            {sections.map(({ group, items }) => {
              const label = group.name;
              // Groups start open; searching always shows matches, even in a folded group.
              const open = !!query.trim() || !collapsed.includes(label);
              const locked = label === FALLBACK_GROUP;
              const isEditing = editingGroup?.id === group.id;
              return (
                <section
                  key={group.id}
                  data-group-name={label}
                  className={`bg-card border rounded-3xl overflow-hidden transition-colors ${
                    dragCat && overGroup === label ? 'border-primary ring-2 ring-primary/40' : 'border-border'
                  }`}
                >
                  {isEditing ? (
                    <div className="flex items-center gap-2 p-3">
                      <input
                        autoFocus
                        value={editingGroup.name}
                        maxLength={40}
                        enterKeyHint="done"
                        onChange={(e) => setEditingGroup({ id: group.id, name: e.target.value })}
                        onKeyDown={blurOnEnter}
                        className="form-input flex-1 min-w-0 !py-2"
                      />
                      <button onClick={handleRenameGroup} disabled={updateGroup.isPending} aria-label="Save" className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                        <Check className="w-4 h-4 text-primary" />
                      </button>
                      <button onClick={() => setDeletingGroup(group)} aria-label={`Delete ${label}`} className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                      <button onClick={() => setEditingGroup(null)} aria-label="Cancel" className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <GroupHeader
                      label={label}
                      count={items.length}
                      open={open}
                      locked={locked}
                      onToggle={() => toggleGroup(label)}
                      onEdit={() => setEditingGroup({ id: group.id, name: label })}
                    />
                  )}
                  {open && (
                    items.length === 0 ? (
                      <p className="px-4 pb-4 text-xs text-muted-foreground">No categories yet</p>
                    ) : (
                      <div className="grid grid-cols-4 gap-x-2 gap-y-4 px-4 pb-4">
                        {items.map((cat) => (
                          <CategoryCard key={cat.id} category={cat} drag={moveMode ? dragHandlers : undefined} dragging={dragCat?.id === cat.id} />
                        ))}
                      </div>
                    )
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {dragCat &&
        // Portaled to <body>: a transformed ancestor (the fade-in wrapper) would otherwise offset position:fixed.
        createPortal(
          <div
            className="fixed z-[200] pointer-events-none w-16 h-16 rounded-full flex items-center justify-center text-3xl shadow-2xl ring-2 ring-primary"
            style={{
              left: 0,
              top: 0,
              transform: `translate(${dragPos.x - 32}px, ${dragPos.y - 32}px) scale(1.1)`,
              backgroundColor: dragCat.color,
            }}
          >
            {dragCat.icon}
          </div>,
          document.body,
        )}

      <ConfirmModal
        open={!!deletingGroup}
        onOpenChange={(open) => { if (!open) setDeletingGroup(null); }}
        title="Delete Group"
        description={`Delete "${deletingGroup?.name}"? Its categories will move to "${FALLBACK_GROUP}".`}
        onConfirm={() =>
          deletingGroup &&
          deleteGroup.mutate(deletingGroup.id, {
            onSuccess: () => {
              setDeletingGroup(null);
              setEditingGroup(null);
            },
          })
        }
        isLoading={deleteGroup.isPending}
      />
    </div>
  );
}
