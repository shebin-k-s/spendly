import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, ArrowDownLeft, Trash2, Phone, Pencil } from 'lucide-react';
import { usePerson, useAddDebtTransaction, useDeleteDebtTransaction } from '../hooks/usePeople';
import { formatINR } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { DateTimePicker } from '@/components/DateTimePicker';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

export default function PersonDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: person, isLoading } = usePerson(id!);
  const addTransaction = useAddDebtTransaction(id!);
  const deleteTransaction = useDeleteDebtTransaction(id!);
  const isPending = addTransaction.isPending || deleteTransaction.isPending;
  const [deleteTransactionId, setDeleteTransactionId] = useState<string | null>(null);
  const isBlocking = isPending || !!deleteTransactionId;

  const [showAddForm, setShowAddForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'GIVEN' | 'RETURNED'>('GIVEN');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [note, setNote] = useState('');


  if (isLoading) {
    return (
      <div className="animate-fade-in">
        <div className="page-header">
          <div className="w-10 h-10 rounded-2xl bg-muted animate-pulse shrink-0" />
          <div className="space-y-1.5 flex-1">
            <div className="h-5 w-36 bg-muted animate-pulse rounded-lg" />
            <div className="h-3 w-24 bg-muted animate-pulse rounded-lg" />
          </div>
        </div>
        <div className="page-content space-y-4">
          <div className="h-36 bg-muted animate-pulse rounded-2xl" />
          <div className="h-4 w-20 bg-muted animate-pulse rounded-lg" />
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!person) return null;

  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;
    addTransaction.mutate({
      amount: parseFloat(amount),
      type,
      date,
      note: note.trim() || undefined,
    }, {
      onSuccess: () => {
        setAmount('');
        setNote('');
        setShowAddForm(false);
      },
    });
  };

  const balanceLabel =
    person.balance === 0 ? 'Settled up' :
    person.balance > 0 ? 'They owe you' :
    'You owe them';

  const b = Number(person.balance);
  const btnLabels = b > 0
    ? { given: 'Lent more', returned: 'They repaid' }
    : b < 0
      ? { given: 'I repaid', returned: 'They lent more' }
      : { given: 'I gave them', returned: 'They gave me' };

  const formTitle =
    type === 'GIVEN'
      ? (b > 0 ? 'Lending more' : b < 0 ? 'Repaying them' : 'I gave money')
      : (b > 0 ? 'Recording repayment' : b < 0 ? 'They lent more' : 'They gave me money');

  // Group transactions by month (yyyy-MM), newest first
  const groupedByMonth = person.transactions.reduce<Record<string, typeof person.transactions>>(
    (acc, t) => {
      const key = t.date.slice(0, 7);
      if (!acc[key]) acc[key] = [];
      acc[key].push(t);
      return acc;
    },
    {},
  );
  const sortedMonths = Object.keys(groupedByMonth).sort((a, b) => b.localeCompare(a));

  return (
    <div className="animate-fade-in">
      <div className="page-header justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/people')}
            className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center active:scale-95 transition-transform shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{person.name}</h1>
            {person.phoneNumber && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                <Phone className="w-3 h-3 shrink-0" />
                <span>{person.phoneNumber}</span>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => navigate(`/people/${id}/edit`, { state: { person } })}
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center active:opacity-60 transition-opacity shrink-0"
        >
          <Pencil className="w-4 h-4" />
        </button>
      </div>

      <div className="page-content space-y-5">
        {/* Balance Card */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">{balanceLabel}</p>
          <p className={cn(
            'text-3xl font-bold mt-1',
            person.balance > 0 ? 'text-primary' :
            person.balance < 0 ? 'text-destructive' :
            'text-foreground',
          )}>
            {person.balance === 0 ? '—' : formatINR(Math.abs(person.balance))}
          </p>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => { setType('GIVEN'); setShowAddForm(true); }}
              disabled={isBlocking}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:opacity-80 transition-opacity disabled:opacity-50"
            >
              <ArrowUpRight className="w-4 h-4" />
              {btnLabels.given}
            </button>
            <button
              onClick={() => { setType('RETURNED'); setShowAddForm(true); }}
              disabled={isBlocking}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-success text-success-foreground font-semibold text-sm active:opacity-80 transition-opacity disabled:opacity-50"
            >
              <ArrowDownLeft className="w-4 h-4" />
              {btnLabels.returned}
            </button>
          </div>
        </div>

        {/* Add Transaction Form */}
        {showAddForm && (
          <form
            onSubmit={handleAddTransaction}
            className="bg-card border border-border rounded-2xl p-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{formTitle}</p>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-xs text-muted-foreground font-medium active:text-foreground"
              >
                Cancel
              </button>
            </div>

            <div>
              <label className="form-label">Amount (₹)</label>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isBlocking}
                onWheel={(e) => e.currentTarget.blur()}
                placeholder="0.00"
                className="form-input text-xl font-bold"
                autoFocus
              />
            </div>

            <div>
              <label className="form-label">Date</label>
              <DateTimePicker
                date={date}
                time={null}
                disabled={isBlocking}
                onChange={(d) => setDate(d)}
              />
            </div>

            <div>
              <label className="form-label">Note (Optional)</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={isBlocking}
                placeholder="What was this for?"
                className="form-input"
              />
            </div>

            <button
              type="submit"
              disabled={!amount || parseFloat(amount) <= 0 || isBlocking}
              className={cn(
                'w-full py-3 rounded-xl font-semibold text-sm transition-opacity active:opacity-80 disabled:opacity-40',
                type === 'GIVEN' ? 'bg-primary text-primary-foreground' : 'bg-success text-success-foreground',
              )}
            >
              {addTransaction.isPending ? 'Saving...' : 'Save'}
            </button>
          </form>
        )}

        {/* History */}
        <div className="space-y-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            History
            {person.transactions.length > 0 && (
              <span className="ml-1 font-normal">· {person.transactions.length}</span>
            )}
          </p>

          {person.transactions.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground bg-card border border-border rounded-2xl">
              No transactions yet
            </div>
          ) : (
            sortedMonths.map((monthKey) => {
              const txns = groupedByMonth[monthKey].slice().sort((a, b) => b.date.localeCompare(a.date));
              const monthNet = txns.reduce(
                (sum, t) => t.type === 'GIVEN' ? sum + Number(t.amount) : sum - Number(t.amount),
                0,
              );
              const monthLabel = format(parseISO(monthKey + '-01'), 'MMM yyyy');
              return (
                <div key={monthKey}>
                  {/* Month header — mirrors ExpensesPage date header */}
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {monthLabel}
                    </p>
                    <p className={cn(
                      'text-xs font-semibold',
                      monthNet > 0 ? 'text-primary' :
                      monthNet < 0 ? 'text-success' :
                      'text-muted-foreground',
                    )}>
                      {monthNet > 0 ? '+' : monthNet < 0 ? '−' : ''}{formatINR(Math.abs(monthNet))}
                    </p>
                  </div>

                  {/* Transactions for this month */}
                  <div className="space-y-2">
                    {txns.map((t) => (
                      <div
                        key={t.id}
                        className="touch-card px-4 py-3 flex items-center gap-3"
                      >
                        <div className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                          t.type === 'GIVEN' ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success',
                        )}>
                          {t.type === 'GIVEN'
                            ? <ArrowUpRight className="w-5 h-5" />
                            : <ArrowDownLeft className="w-5 h-5" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{formatINR(Number(t.amount))}</p>
                            <span className={cn(
                              'text-[10px] font-semibold px-1.5 py-0.5 rounded-md',
                              t.type === 'GIVEN' ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success',
                            )}>
                              {t.type === 'GIVEN' ? 'Lent' : 'Repaid'}
                            </span>
                          </div>
                          {t.note && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{t.note}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                            {format(parseISO(t.date), 'dd MMM')}
                          </p>
                        </div>

                        <button
                          onClick={() => setDeleteTransactionId(t.id)}
                          disabled={isBlocking}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground/30 active:text-destructive active:bg-destructive/10 transition-colors shrink-0 disabled:opacity-20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <ConfirmModal
        open={!!deleteTransactionId}
        onOpenChange={(open) => { if (!open) setDeleteTransactionId(null); }}
        title="Delete Transaction"
        description="Remove this transaction? The balance will be recalculated."
        onConfirm={() => { if (deleteTransactionId) deleteTransaction.mutate(deleteTransactionId); }}
        isLoading={deleteTransaction.isPending}
      />
    </div>
  );
}
