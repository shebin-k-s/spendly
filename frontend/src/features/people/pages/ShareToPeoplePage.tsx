import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, ArrowDownLeft, Search, Check, UserPlus, Loader2, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { usePeople } from '../hooks/usePeople';
import { peopleApi } from '../api/peopleApi';
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
}

function matchPerson(transferPerson: string, phone: string | null, people: Person[]): Person | null {
  const q        = transferPerson.toLowerCase().trim();
  const qCompact = q.replace(/[\s._-]/g, '');
  const qDigits  = q.replace(/\D/g, '');

<<<<<<< HEAD
  // 1. Explicit Phone number (highest priority)
  if (phone) {
    const pDigits = phone.replace(/\D/g, '');
    if (pDigits.length >= 6) {
      const match = people.find(p => p.phoneNumber && p.phoneNumber.replace(/\D/g, '').includes(pDigits));
      if (match) return match;
    }
  }

  // 2. Fallback: Phone number hidden in transfer person string
=======
  // 1. Phone number — strongest signal
  
>>>>>>> beb8ab864bc0c5ef295c9c791d6cba455ce4edb1
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
    const upiPrefix  = q.split('@')[0];
    const upiCompact = upiPrefix.replace(/[\s._-]/g, '');
    const upi = people.find(p => {
      const n = p.name.toLowerCase();
      return n === upiPrefix || n.replace(/[\s._-]/g, '') === upiCompact;
    });
    if (upi) return upi;
  }

  // 6. Partial name
  return people.find(p => {
    const name = p.name.toLowerCase();
    return name.includes(q) || q.includes(name);
  }) ?? null;
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
  } catch {}
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

  const filteredPeople = people.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

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
        <div className="flex-1 flex justify-end">
          <button
            onClick={() => {
              navigate('/expenses/new', {
                state: {
                  prefill: {
                    amount,
                    description: note,
                    date,
                    paymentMethod: 'upi',
                    categoryId: '',
                    note: '',
                  },
                  shareTs: state.shareTs,
                  forceExpense: true,
                  transfer_person: state.transfer_person ?? null,
                  transfer_direction: state.transfer_direction ?? null,
                },
                replace: true,
              });
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-secondary text-foreground text-xs font-semibold active:scale-95 transition-all border border-border/50 shadow-sm"
          >
            <Receipt className="w-4 h-4" />
            Switch to Expense
          </button>
        </div>
      </div>

      <div className="page-content space-y-5">
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
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Select Person
          </p>

          {people.length > 4 && (
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
            <div className="space-y-2">
              {/* Add new person card — shown when AI detected a name not in the list */}
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
                  {searchQuery ? 'No one matches' : 'No people added yet — go to People tab first'}
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
                        "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0 transition-colors",
                        isSelected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
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
