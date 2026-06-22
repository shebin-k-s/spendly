import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, ArrowDownLeft, Search, Check, UserPlus, Loader2, Receipt, Plus, X, Users, Sparkles, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { usePeople } from '../hooks/usePeople';
import { peopleApi } from '../api/peopleApi';
import { expensesApi } from '@/features/expenses/api/expensesApi';
import type { Person } from '../types';
import { formatINR } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { DateTimePicker } from '@/components/DateTimePicker';

interface ShareState {
  amount?: string;
  note?: string;
  date?: string | null;
  shareTs?: number;
  transfer_person?: string | null;
  transfer_phone?: string | null;
  transfer_direction?: 'sent' | 'received' | null;
  backRoute?: string;
  thumbnail?: string | null;
  rawText?: string | null;
  shareType?: string | null;
  fromNlParse?: boolean;
  categoryId?: string | null;
  expenseNote?: string | null;
}

function matchPerson(transferPerson: string, phone: string | null, people: Person[]): Person | null {
  const q = transferPerson.toLowerCase().trim();
  const qCompact = q.replace(/[\s._-]/g, '');
  const qDigits = q.replace(/\D/g, '');

  // 1. Explicit Phone number (highest priority)
  if (phone) {
    const pDigits = phone.replace(/\D/g, '');
    if (pDigits.length >= 6) {
      const match = people.find(p => p.phoneNumber && p.phoneNumber.replace(/\D/g, '').includes(pDigits));
      if (match) return match;
    }
  }

  // 2. Fallback: Phone number hidden in transfer person string
  if (qDigits.length >= 6) {
    const m = people.find(p => {
      if (!p.phoneNumber) return false;

      const personDigits = p.phoneNumber.replace(/\D/g, '');

      // handle Indian country code
      const normalizedPerson =
        personDigits.length > 10
          ? personDigits.slice(-10)
          : personDigits;

      const normalizedQuery =
        qDigits.length > 10
          ? qDigits.slice(-10)
          : qDigits;

      return normalizedPerson === normalizedQuery;
    });

    if (m) return m;
  }

  // 3. Exact name
  const exact = people.find(p => p.name.toLowerCase() === q);
  if (exact) return exact;

  // 4. Compact name (ignore spaces / dots / dashes)
  if (qCompact.length > 3) {
    const compact = people.find(p => p.name.toLowerCase().replace(/[\s._-]/g, '') === qCompact);
    if (compact) return compact;
  }

  // 5. UPI prefix
  if (q.includes('@')) {
    const upiPrefix = q.split('@')[0];
    const upiCompact = upiPrefix.replace(/[\s._-]/g, '');
    const upi = people.find(p => {
      const n = p.name.toLowerCase();
      return n === upiPrefix || n.replace(/[\s._-]/g, '') === upiCompact;
    });
    if (upi) return upi;
  }

  return null;
}

async function removeFromQueue(ts: number): Promise<void> {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open('spendly-share');
    const res = await cache.match('/share-queue');
    if (!res) return;
    const queue: unknown[] = await res.json();
    const next = queue.filter((item: any) => item.ts !== ts);
    if (next.length === 0) {
      await cache.delete('/share-queue');
      navigator.clearAppBadge?.();
    } else {
      await cache.put('/share-queue', new Response(JSON.stringify(next), {
        headers: { 'Content-Type': 'application/json' },
      }));
      navigator.setAppBadge?.(next.length);
    }
  } catch { }
}

export default function ShareToPeoplePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as ShareState;

  const { data: people = [], isLoading } = usePeople();
  const queryClient = useQueryClient();

  const directionType: 'GIVEN' | 'RETURNED' =
    state.transfer_direction === 'received' ? 'RETURNED' : 'GIVEN';

  const autoMatch = useMemo(
    () => (state.transfer_person && people.length ? matchPerson(state.transfer_person, state.transfer_phone ?? null, people) : null),
    [state.transfer_person, state.transfer_phone, people],
  );

  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  // Auto-select when people list loads or updates
  useEffect(() => {
    if (autoMatch && !selectedPersonId) {
      setSelectedPersonId(autoMatch.id);
    }
  }, [autoMatch, selectedPersonId]);
  const [newPersonName, setNewPersonName] = useState<string | null>(null);
  const [type, setType] = useState<'GIVEN' | 'RETURNED'>(directionType);
  const [amount, setAmount] = useState(state.amount ?? '');
  const [date, setDate] = useState(state.date ?? format(new Date(), 'yyyy-MM-dd'));
  const [note, setNote] = useState(state.note ?? '');
  const [searchQuery, setSearchQuery] = useState('');
  const [addingPerson, setAddingPerson] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [nlText, setNlText] = useState(state.rawText ?? '');
  const [nlStatus, setNlStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const backRoute = state.backRoute ?? '/';

  const addTransaction = useMutation({
    mutationFn: ({ personId, payload }: { personId: string; payload: any }) =>
      peopleApi.addTransaction(personId, payload),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      if (state.shareTs) await removeFromQueue(state.shareTs);
      toast.success('Transaction added');
      navigate(`/people/${selectedPersonId}`, { replace: true });
    },
    onError: () => toast.error('Failed to add transaction'),
  });

  const filteredPeople = people
    .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => (b.id === autoMatch?.id ? 1 : 0) - (a.id === autoMatch?.id ? 1 : 0));

  const selectedPerson = people.find(p => p.id === selectedPersonId);
  const displayName = selectedPerson?.name ?? newPersonName;
  const canSave = !!selectedPersonId && !!amount && parseFloat(amount) > 0 && !addTransaction.isPending && !addingPerson;

  const handleSave = () => {
    if (!canSave || !selectedPersonId) return;
    addTransaction.mutate({
      personId: selectedPersonId,
      payload: { amount: parseFloat(amount), type, date, note: note.trim() || undefined },
    });
  };

  const handleAddPerson = async () => {
    if (!state.transfer_person) return;
    setAddingPerson(true);
    try {
      const newPerson = await peopleApi.createPerson({
        name: state.transfer_person,
        ...(state.transfer_phone ? { phoneNumber: state.transfer_phone } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ['people'] });
      setSelectedPersonId(newPerson.id);
      setNewPersonName(newPerson.name);
      toast.success('Person added');
    } catch {
      toast.error('Failed to add person');
    } finally {
      setAddingPerson(false);
    }
  };

  const handleNlParse = async () => {
    if (!nlText.trim() || nlStatus === 'loading') return;
    setNlStatus('loading');
    try {
      const result = await expensesApi.parseText(nlText.trim());
      if (typeof result.amount === 'string' && result.amount) setAmount(result.amount);
      if (typeof result.description === 'string' && result.description) setNote(result.description);
      if (typeof result.date === 'string' && result.date) setDate(result.date);
      if (result.transfer_direction === 'received') setType('RETURNED');
      else if (result.transfer_direction === 'sent') setType('GIVEN');
      if (typeof result.transfer_person === 'string' && result.transfer_person && people.length > 0) {
        const matched = matchPerson(result.transfer_person, (result as any).transfer_phone ?? null, people);
        if (matched) setSelectedPersonId(matched.id);
      }
      setNlStatus('done');
      if (result.suggested_flow === 'expense') {
        navigate('/expenses/new', {
          state: {
            prefill: {
              amount: typeof result.amount === 'string' ? result.amount : amount,
              description: typeof result.description === 'string' ? result.description : note,
              date: typeof result.date === 'string' && result.date ? result.date : date,
              categoryId: typeof result.category_id === 'string' ? result.category_id : '',
              note: typeof result.note === 'string' ? result.note : '',
            },
            shareTs: state.shareTs,
            forceExpense: true,
            thumbnail: state.thumbnail ?? null,
            rawText: nlText.trim(),
            shareType: 'text',
            fromNlParse: true,
          },
          replace: true,
        });
      }
    } catch {
      setNlStatus('error');
    }
  };

  const handleCreateNewPerson = async () => {
    if (!newName.trim()) return;
    setAddingPerson(true);
    try {
      const created = await peopleApi.createPerson({
        name: newName.trim(),
        ...(newPhone.trim() ? { phoneNumber: newPhone.trim() } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ['people'] });
      setSelectedPersonId(created.id);
      setNewPersonName(created.name);
      setShowAddForm(false);
      setNewName('');
      setNewPhone('');
      toast.success('Person added');
    } catch {
      toast.error('Failed to add person');
    } finally {
      setAddingPerson(false);
    }
  };

  const showAddCard = !!state.transfer_person && !autoMatch && !selectedPersonId && !searchQuery;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <button
          onClick={() => navigate(backRoute, { replace: true })}
          className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center active:scale-95 transition-transform shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold">Log to People</h1>
          <p className="text-xs text-muted-foreground">Who was this with?</p>
        </div>
      </div>

      <div className="page-content space-y-5">
        {/* Flow switcher */}
        <div className="flex bg-secondary rounded-2xl p-1">
          <button
            onClick={() => navigate('/expenses/new', {
              state: {
                prefill: { amount, description: note, date, categoryId: state.categoryId ?? '', note: state.expenseNote ?? '' },
                shareTs: state.shareTs,
                forceExpense: true,
                transfer_person: state.transfer_person ?? null,
                transfer_direction: state.transfer_direction ?? null,
                thumbnail: state.thumbnail ?? null,
                rawText: state.rawText ?? null,
                shareType: state.shareType ?? null,
                fromNlParse: state.fromNlParse ?? false,
              },
              replace: true,
            })}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-muted-foreground text-xs font-semibold active:scale-95 transition-all"
          >
            <Receipt className="w-3.5 h-3.5" />
            Expense
          </button>
          <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-card shadow-sm text-foreground text-xs font-semibold">
            <Users className="w-3.5 h-3.5" />
            Lending
          </div>
        </div>
        {/* AI Quick Parse — only when user arrived via NL typing, not from a text share */}
        {state.fromNlParse && (
          <div className="p-3.5 rounded-3xl bg-primary/5 border border-primary/10 space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-primary">AI Quick Parse</span>
            </div>
            <textarea
              value={nlText}
              onChange={(e) => { setNlText(e.target.value); if (nlStatus !== 'idle') setNlStatus('idle'); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleNlParse(); } }}
              placeholder='e.g. "gave Rahul 500 for dinner"'
              rows={2}
              className="form-input resize-none text-sm bg-background/60"
            />
            <button
              onClick={() => void handleNlParse()}
              disabled={!nlText.trim() || nlStatus === 'loading'}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              {nlStatus === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Parse
            </button>
            {nlStatus === 'done' && (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20">
                <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <p className="text-xs font-medium text-primary">Fields updated — edit or re-parse</p>
              </div>
            )}
            {nlStatus === 'error' && (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-destructive/10 border border-destructive/20">
                <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                <p className="text-[11px] font-medium text-destructive">Couldn't parse — fill manually</p>
              </div>
            )}
          </div>
        )}

        {/* Amount + type */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
          <div>
            <label className="form-label">Amount (₹)</label>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onWheel={e => e.currentTarget.blur()}
              placeholder="0.00"
              className="form-input text-xl font-bold"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType('GIVEN')}
              className={cn(
                'flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-semibold text-sm transition-all',
                type === 'GIVEN' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground',
              )}
            >
              <ArrowUpRight className="w-4 h-4" />
              I Gave
            </button>
            <button
              type="button"
              onClick={() => setType('RETURNED')}
              className={cn(
                'flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-semibold text-sm transition-all',
                type === 'RETURNED' ? 'bg-success text-success-foreground' : 'bg-secondary text-muted-foreground',
              )}
            >
              <ArrowDownLeft className="w-4 h-4" />
              They Gave
            </button>
          </div>
        </div>

        {/* Person picker */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Select Person</p>
            <button
              onClick={() => { setShowAddForm(f => !f); setNewName(''); setNewPhone(''); }}
              className="flex items-center gap-1 text-xs font-semibold text-primary active:scale-95 transition-all"
            >
              {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {showAddForm ? 'Cancel' : 'Add Person'}
            </button>
          </div>

          {showAddForm && (
            <div className="bg-card border border-primary/20 rounded-2xl p-4 space-y-3 animate-in fade-in zoom-in-95 duration-200">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleCreateNewPerson(); }}
                placeholder="Name *"
                autoFocus
                className="form-input text-sm"
              />
              <input
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleCreateNewPerson(); }}
                placeholder="Phone (optional)"
                inputMode="tel"
                className="form-input text-sm"
              />
              <button
                onClick={() => void handleCreateNewPerson()}
                disabled={!newName.trim() || addingPerson}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                {addingPerson ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Add & Select
              </button>
            </div>
          )}

          {people.length >= 3 && (
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
              />
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-2xl bg-muted animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {/* AI quick-add card — shown when AI detected a name not in the list */}
              {showAddCard && (
                <button
                  onClick={handleAddPerson}
                  disabled={addingPerson}
                  className="touch-card w-full flex items-center gap-3 px-4 py-3 text-left border-primary/30 bg-primary/5 disabled:opacity-50"
                >
                  <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center text-primary shrink-0">
                    {addingPerson ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-primary truncate">Add "{state.transfer_person}"</p>
                    <p className="text-xs text-muted-foreground">Tap to add as new contact</p>
                  </div>
                </button>
              )}

              {filteredPeople.length === 0 && !showAddCard ? (
                <div className="py-8 text-center text-sm text-muted-foreground bg-card border border-border rounded-2xl">
                  {searchQuery ? 'No one matches' : 'No people added yet — tap + Add Person above'}
                </div>
              ) : (
                filteredPeople.map(person => {
                  const isSelected = selectedPersonId === person.id;
                  return (
                    <button
                      key={person.id}
                      onClick={() => setSelectedPersonId(isSelected ? null : person.id)}
                      className={cn(
                        'touch-card w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-300',
                        isSelected ? 'border-primary bg-primary/10 shadow-md shadow-primary/5' : 'border-border/50',
                      )}
                    >
                      <div className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0 transition-colors',
                        isSelected ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
                      )}>
                        {person.name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{person.name}</p>
                        {person.balance !== 0 && (
                          <p className={cn('text-xs', person.balance > 0 ? 'text-primary' : 'text-destructive')}>
                            {person.balance > 0 ? 'Owes you' : 'You owe'}{' '}
                            {formatINR(Math.abs(Number(person.balance)))}
                          </p>
                        )}
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Date + Note */}
        <div className="space-y-4">
          <div>
            <label className="form-label">Date</label>
            <DateTimePicker date={date} time={null} onChange={d => setDate(d)} />
          </div>
          <div>
            <label className="form-label">Note (Optional)</label>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="What was this for?"
              className="form-input"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!canSave}
          className={cn(
            'w-full py-3.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40',
            type === 'GIVEN' ? 'bg-primary text-primary-foreground' : 'bg-success text-success-foreground',
          )}
        >
          {addTransaction.isPending
            ? 'Saving...'
            : displayName
              ? `Save for ${displayName}`
              : 'Select a Person'}
        </button>
      </div>
    </div>
  );
}
