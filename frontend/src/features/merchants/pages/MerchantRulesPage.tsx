import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Plus, Search, Sparkles, Store, X } from 'lucide-react';
import { useMerchantRulesQuery } from '../hooks/useMerchantRules';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import EmptyState from '@/components/EmptyState';
import { MerchantRuleSheet } from '../components/MerchantRuleSheet';
import type { MerchantRule } from '../types';

const SEARCH_THRESHOLD = 5; // search only earns its space once the list is long

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
}

function MerchantRuleCard({ rule, onClick }: { rule: MerchantRule; onClick: () => void }) {
  const { category } = rule;
  return (
    <button onClick={onClick} className="touch-card w-full flex items-start gap-3 px-4 py-3.5 text-left">
      <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center text-sm font-bold text-primary shrink-0">
        {initials(rule.name)}
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        <p className="font-semibold text-sm truncate">{rule.name}</p>

        <span
          className="inline-flex items-center gap-1.5 max-w-full rounded-lg px-2 py-1 text-xs font-medium"
          style={{ backgroundColor: `${category.color}22`, color: category.color }}
        >
          <span className="text-sm leading-none">{category.icon}</span>
          <span className="truncate">{category.name}</span>
        </span>

        {rule.aliases.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Also</span>
            {rule.aliases.map((alias) => (
              <span key={alias} className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {alias}
              </span>
            ))}
          </div>
        )}
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0 self-center" />
    </button>
  );
}

export default function MerchantRulesPage() {
  const navigate = useNavigate();
  const rulesQuery = useMerchantRulesQuery();
  const { data: rules = [], isLoading } = rulesQuery;
  useRefetchOnFocus(rulesQuery);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<MerchantRule | null>(null);
  const [query, setQuery] = useState('');

  const openSheet = (rule: MerchantRule | null) => {
    setEditing(rule);
    setSheetOpen(true);
  };

  const q = query.trim().toLowerCase();
  const visible = q
    ? rules.filter((r) =>
        [r.name, r.category.name, ...r.aliases].some((s) => s.toLowerCase().includes(q)))
    : rules;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">AI shop rules</p>
          <h1 className="text-xl font-bold">Shops</h1>
        </div>
        <button
          onClick={() => openSheet(null)}
          aria-label="Add shop"
          className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center"
        >
          <Plus className="w-4 h-4 text-primary-foreground" />
        </button>
      </div>

      <div className="page-content space-y-4">
        <div className="flex items-start gap-3 rounded-2xl bg-primary/10 px-4 py-3">
          <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-foreground/80">
            Mention a shop when adding an expense (e.g. <span className="font-medium">"milk from ayaans"</span>) and AI always files it under that shop's category.
          </p>
        </div>

        {rules.length > SEARCH_THRESHOLD && (
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search shops..."
              enterKeyHint="search"
              className="w-full bg-card border border-border rounded-xl pl-10 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
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
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[88px] rounded-2xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <EmptyState
            icon={Store}
            title="No shops yet"
            description="Add a shop you buy from often, like your local grocery, and pick the category it belongs to."
            action={
              <button
                onClick={() => openSheet(null)}
                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
              >
                Add Shop
              </button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState icon={Search} title="No results" description={`No shops match "${query}".`} />
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">
              {visible.length} {visible.length === 1 ? 'shop' : 'shops'}
            </p>
            {visible.map((rule) => (
              <MerchantRuleCard key={rule.id} rule={rule} onClick={() => openSheet(rule)} />
            ))}
          </div>
        )}
      </div>

      <MerchantRuleSheet open={sheetOpen} onOpenChange={setSheetOpen} rule={editing} />
    </div>
  );
}
