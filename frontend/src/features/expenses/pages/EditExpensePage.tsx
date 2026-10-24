import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Check, Trash2, Loader2, Sparkles, Mic, Square, RotateCcw, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { useExpenseById, useUpdateExpense, useDeleteExpense } from '../hooks/useExpenses';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { expensesApi } from '../api/expensesApi';
import { audioToWav } from '../utils/audioToWav';
import { useCategoriesQuery } from '@/features/categories/hooks/useCategories';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { DateTimePicker } from '@/components/DateTimePicker';
import { useSwipeGesture } from '@/context/SwipeGestureContext';
import { cn, stripTrailingZeros } from '@/lib/utils';
import { getErrorMessage } from '@/utils/getErrorMessage';
import { blurOnEnter, focusNextOnEnter } from '@/utils/keyboard';

// Marks a field the user (or the AI) has changed since the expense was loaded,
// shows what it used to be, and lets them put just that field back.
function FieldLabel({ text, hint, edited, was, onRevert }: { text: string; hint?: string; edited: boolean; was: ReactNode; onRevert: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <label className="form-label">
        {text} {hint && <span className="text-muted-foreground font-normal">— {hint}</span>}
      </label>
      {edited && (
        <button
          type="button"
          onClick={onRevert}
          className="shrink-0 flex items-center gap-1 rounded-lg bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-500 active:scale-95 transition-transform max-w-[60%]"
          aria-label={`Undo edit to ${text}`}
        >
          <RotateCcw className="w-3 h-3 shrink-0" />
          <span className="truncate">Edited · was {was}</span>
        </button>
      )}
    </div>
  );
}

const editedRing = (edited: boolean) => (edited ? 'border-amber-500/60 ring-1 ring-amber-500/40' : '');

export default function EditExpensePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const initialExpense = location.state?.expense;

  const { data: expense, isLoading } = useExpenseById(id!, !initialExpense);
  const refExpense = expense || initialExpense;
  const { data: rawCategories = [] } = useCategoriesQuery();
  const categories = [...rawCategories].sort((a, b) => a.name.localeCompare(b.name));
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const isPending = updateExpense.isPending || deleteExpense.isPending;

  const [amount, setAmount] = useState(initialExpense ? stripTrailingZeros(initialExpense.amount) : '');
  const [cashback, setCashback] = useState(initialExpense?.cashback ? stripTrailingZeros(initialExpense.cashback) : '');
  const [description, setDescription] = useState(initialExpense?.description || '');
  const [date, setDate] = useState(initialExpense?.date || '');
  const [time, setTime] = useState<string | null>(initialExpense?.time ?? null);
  const [categoryId, setCategoryId] = useState(initialExpense?.category?.id || '');
  const [note, setNote] = useState(initialExpense?.note || '');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // AI / voice editing — only ever fills the form below; saving is always the Save button.
  const [instruction, setInstruction] = useState('');
  const [revising, setRevising] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [pendingWav, setPendingWav] = useState<Blob | null>(null);
  const aiBusy = revising || transcribing;
  const isBlocking = isPending || showDeleteModal || aiBusy;

  const { disableGlobalSwipe, enableGlobalSwipe } = useSwipeGesture();

  useEffect(() => {
    disableGlobalSwipe();
    return () => enableGlobalSwipe();
  }, [disableGlobalSwipe, enableGlobalSwipe]);

  useEffect(() => {
    if (expense) {
      setAmount(stripTrailingZeros(expense.amount));
      setCashback(expense.cashback ? stripTrailingZeros(expense.cashback) : '');
      setDescription(expense.description);
      setDate(expense.date);
      setTime(expense.time ?? null);
      setCategoryId(expense.category?.id || '');
      setNote(expense.note || '');
    }
  }, [expense]);

  // What the expense looked like when it was loaded — the baseline every edit is measured against.
  const orig = useMemo(() => {
    if (!refExpense) return null;
    return {
      amount: stripTrailingZeros(refExpense.amount) as string,
      cashback: (refExpense.cashback ? stripTrailingZeros(refExpense.cashback) : '') as string,
      description: (refExpense.description || '') as string,
      date: refExpense.date as string,
      time: (refExpense.time ?? null) as string | null,
      categoryId: (refExpense.category?.id || '') as string,
      categoryName: (refExpense.category?.name || 'None') as string,
      note: (refExpense.note || '') as string,
    };
  }, [refExpense]);

  const edited = useMemo(() => {
    if (!orig) return { amount: false, description: false, cashback: false, when: false, category: false, note: false };
    return {
      amount: Number(amount) !== Number(orig.amount),
      cashback: Number(cashback || 0) !== Number(orig.cashback || 0),
      description: description.trim() !== orig.description.trim(),
      when: date !== orig.date || (time || null) !== (orig.time || null),
      category: (categoryId || '') !== orig.categoryId,
      note: note.trim() !== orig.note.trim(),
    };
  }, [orig, amount, cashback, description, date, time, categoryId, note]);

  const editedLabels = [
    edited.amount && 'Amount',
    edited.description && 'Description',
    edited.cashback && 'Cashback',
    edited.when && 'Date & time',
    edited.category && 'Category',
    edited.note && 'Note',
  ].filter(Boolean) as string[];
  const isChanged = editedLabels.length > 0;

  const revertAll = () => {
    if (!orig) return;
    setAmount(orig.amount);
    setCashback(orig.cashback);
    setDescription(orig.description);
    setDate(orig.date);
    setTime(orig.time);
    setCategoryId(orig.categoryId);
    setNote(orig.note);
  };

  const canSubmit = amount.trim() && description.trim() && isChanged && !isBlocking;

  const handleUpdate = () => {
    if (!canSubmit) return;
    updateExpense.mutate(
      {
        id: id!,
        amount: parseFloat(amount),
        cashback: cashback ? parseFloat(cashback) : 0,
        description: description.trim(),
        date,
        time: time || undefined,
        note: note.trim() || undefined,
        categoryId: categoryId || undefined,
      },
      { onSuccess: () => navigate(-1) },
    );
  };

  // Apply the AI's reading of an instruction to the form — never to the database.
  const runRevise = async (text: string) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    setRevising(true);
    try {
      const res = await expensesApi.reviseExpense(
        { amount: amount || null, description: description || null, date: date || null, time, category_id: categoryId || null, note: note || null, cashback: cashback || null },
        cleaned,
      );
      const str = (v: unknown) => (typeof v === 'string' ? v : null);
      const changed: string[] = [];

      const nextAmount = str(res.amount) && Number(res.amount) > 0 ? stripTrailingZeros(String(res.amount)) : amount;
      if (Number(nextAmount) !== Number(amount)) { setAmount(nextAmount); changed.push('Amount'); }

      const nextDescription = str(res.description)?.trim() || description;
      if (nextDescription !== description) { setDescription(nextDescription); changed.push('Description'); }

      const nextDate = str(res.date) && /^\d{4}-\d{2}-\d{2}$/.test(res.date as string) ? (res.date as string) : date;
      const nextTime = str(res.time) && /^\d{2}:\d{2}$/.test(res.time as string) ? (res.time as string) : time;
      if (nextDate !== date || nextTime !== time) { setDate(nextDate); setTime(nextTime); changed.push('Date & time'); }

      const nextCategory = str(res.category_id) && categories.some((c) => c.id === res.category_id) ? (res.category_id as string) : categoryId;
      if (nextCategory !== categoryId) { setCategoryId(nextCategory); changed.push('Category'); }

      const nextNote = res.note === null ? note : (str(res.note) ?? note);
      if (nextNote !== note) { setNote(nextNote); changed.push('Note'); }

      const nextCashback = res.cashback === null ? cashback : str(res.cashback) ? stripTrailingZeros(res.cashback as string) : cashback;
      if (Number(nextCashback || 0) !== Number(cashback || 0)) { setCashback(nextCashback); changed.push('Cashback'); }

      if (changed.length) toast.success(`AI changed: ${changed.join(', ')} — check it, then press Save`);
      else toast('AI found nothing to change');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setRevising(false);
    }
  };

  // Voice: record → transcribe the spoken correction → apply it like a typed one.
  const transcribeAndRevise = async (wav: Blob) => {
    setTranscribing(true);
    try {
      const { text } = await expensesApi.transcribeInstruction(wav);
      setPendingWav(null);
      if (!text.trim()) {
        toast.error("Couldn't hear anything — try again");
        return;
      }
      setInstruction(text);
      setTranscribing(false);
      await runRevise(text);
    } catch (err) {
      setPendingWav(wav);
      toast.error(`${getErrorMessage(err)} — tap Retry, your recording is saved`);
    } finally {
      setTranscribing(false);
    }
  };
  const handleClip = async (clip: Blob) => {
    setTranscribing(true);
    try {
      await transcribeAndRevise(await audioToWav(clip));
    } catch (err) {
      setTranscribing(false);
      toast.error(getErrorMessage(err));
    }
  };
  const recorder = useVoiceRecorder((clip) => { void handleClip(clip); });

  const handleDelete = () => setShowDeleteModal(true);
  const executeDelete = () => deleteExpense.mutate(id!, { onSuccess: () => navigate(-1) });

  if (isLoading && !initialExpense) {
    return (
      <div>
        <div className="page-header">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center active:scale-95 transition-transform">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold flex-1">Edit Expense</h1>
        </div>
        <div className="page-content space-y-5 mt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-24 bg-secondary/80 animate-pulse rounded" />
              <div className="h-12 bg-card border border-border rounded-xl animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-xl font-bold flex-1">Edit Expense</h1>
        <button
          onClick={handleUpdate}
          disabled={!canSubmit}
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center disabled:opacity-40"
        >
          {updateExpense.isPending ? (
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          ) : (
            <Check className="w-4 h-4 text-primary" />
          )}
        </button>
        <button
          onClick={handleDelete}
          disabled={isBlocking}
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center"
        >
          {deleteExpense.isPending ? (
            <Loader2 className="w-4 h-4 text-destructive animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4 text-destructive" />
          )}
        </button>
      </div>

      <div className="page-content space-y-5">
        {/* AI + voice: fills the form only — nothing is saved until Save is pressed */}
        <div className="rounded-2xl bg-primary/10 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Sparkles className="w-3.5 h-3.5" /> Edit with AI or voice
          </div>
          <div className="flex items-center gap-2">
            <input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder='e.g. "make it 45" or "add biscuit"'
              disabled={isPending || showDeleteModal || aiBusy}
              enterKeyHint="send"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); void runRevise(instruction); } }}
              className="form-input flex-1 min-w-0 text-sm"
            />
            <button
              type="button"
              onClick={recorder.state === 'recording' ? recorder.stop : () => { setPendingWav(null); void recorder.start(); }}
              disabled={isPending || showDeleteModal || revising || transcribing}
              aria-label={recorder.state === 'recording' ? 'Stop recording' : 'Speak an edit'}
              className={cn(
                'h-10 rounded-xl flex items-center justify-center gap-1.5 shrink-0 active:scale-95 transition-all disabled:opacity-40',
                recorder.state === 'recording' ? 'px-3 bg-destructive text-destructive-foreground text-xs font-semibold animate-pulse' : 'w-10 bg-secondary',
              )}
            >
              {transcribing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : recorder.state === 'recording' ? (
                <><Square className="w-3 h-3 fill-current" /> {Math.floor(recorder.seconds / 60)}:{String(recorder.seconds % 60).padStart(2, '0')}</>
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => void runRevise(instruction)}
              disabled={!instruction.trim() || isPending || showDeleteModal || aiBusy}
              aria-label="Apply with AI"
              className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 active:scale-95 transition-all disabled:opacity-40"
            >
              {revising ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            </button>
          </div>
          {pendingWav && !transcribing && recorder.state !== 'recording' && (
            <button
              type="button"
              onClick={() => void transcribeAndRevise(pendingWav)}
              className="w-full py-2 rounded-xl text-xs font-semibold bg-primary/15 text-primary flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
            >
              <RotateCw className="w-3.5 h-3.5" /> Retry transcription
            </button>
          )}
          <p className="text-[11px] text-muted-foreground">
            The AI only fills the fields below. <span className="font-semibold">Nothing is saved until you press Save.</span>
          </p>
        </div>

        {isChanged && (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
            <div className="flex-1 min-w-0 text-xs">
              <p className="font-semibold text-amber-500">
                {editedLabels.length} {editedLabels.length === 1 ? 'field' : 'fields'} edited — not saved yet
              </p>
              <p className="text-muted-foreground mt-0.5">{editedLabels.join(' · ')}</p>
            </div>
            <button
              type="button"
              onClick={revertAll}
              disabled={isBlocking}
              className="shrink-0 rounded-lg bg-secondary px-2.5 py-1.5 text-[11px] font-semibold active:scale-95 transition-transform disabled:opacity-40"
            >
              Undo all
            </button>
          </div>
        )}

        <div>
          <FieldLabel text="Amount (₹)" edited={edited.amount} was={orig ? `₹${orig.amount}` : ''} onRevert={() => orig && setAmount(orig.amount)} />
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isBlocking}
            onWheel={(e) => e.currentTarget.blur()}
            enterKeyHint="done"
            onKeyDown={blurOnEnter}
            className={cn('form-input text-2xl font-bold', editedRing(edited.amount))}
          />
        </div>

        <div>
          <FieldLabel text="Description" edited={edited.description} was={orig?.description ?? ''} onRevert={() => orig && setDescription(orig.description)} />
          <input value={description} onChange={(e) => setDescription(e.target.value)} disabled={isBlocking} enterKeyHint="done" onKeyDown={blurOnEnter} className={cn('form-input', editedRing(edited.description))} />
        </div>

        <div>
          <FieldLabel text="Cashback (₹)" hint="Optional" edited={edited.cashback} was={orig ? (orig.cashback ? `₹${orig.cashback}` : 'none') : ''} onRevert={() => orig && setCashback(orig.cashback)} />
          <input
            type="number"
            inputMode="decimal"
            value={cashback}
            onChange={(e) => setCashback(e.target.value)}
            disabled={isBlocking}
            onWheel={(e) => e.currentTarget.blur()}
            placeholder="0.00"
            enterKeyHint="done"
            onKeyDown={blurOnEnter}
            className={cn('form-input', editedRing(edited.cashback))}
          />
          {cashback && parseFloat(cashback) > 0 && amount && parseFloat(amount) > 0 && (
            <p className="text-xs text-emerald-500 mt-1.5">
              Net: {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(parseFloat(amount) - parseFloat(cashback))}
            </p>
          )}
        </div>

        <div>
          <FieldLabel
            text="Date & Time"
            edited={edited.when}
            was={orig ? `${orig.date}${orig.time ? ` ${orig.time}` : ''}` : ''}
            onRevert={() => { if (orig) { setDate(orig.date); setTime(orig.time); } }}
          />
          <div className={cn('rounded-xl', editedRing(edited.when))}>
            <DateTimePicker
              date={date || new Date().toISOString().slice(0, 10)}
              time={time}
              disabled={isBlocking}
              onChange={(d, t) => { setDate(d); setTime(t); }}
            />
          </div>
        </div>

        <div>
          <FieldLabel text="Category" edited={edited.category} was={orig?.categoryName ?? ''} onRevert={() => orig && setCategoryId(orig.categoryId)} />
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setCategoryId('')}
              disabled={isBlocking}
              className={`py-2.5 rounded-xl text-xs font-medium transition-colors
                ${!categoryId ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}
            >
              None
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryId(cat.id)}
                disabled={isBlocking}
                className={`py-2.5 px-2 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 justify-center
                  ${categoryId === cat.id ? (edited.category ? 'bg-amber-500 text-black' : 'bg-primary text-primary-foreground') : 'bg-secondary text-secondary-foreground'}`}
              >
                <span>{cat.icon}</span>
                <span className="truncate">{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel text="Note" hint="Optional" edited={edited.note} was={orig?.note ? orig.note : 'empty'} onRevert={() => orig && setNote(orig.note)} />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={isBlocking} rows={2} enterKeyHint="done" onKeyDown={blurOnEnter} className={cn('form-input resize-none', editedRing(edited.note))} />
        </div>

        <button onClick={handleUpdate} disabled={!canSubmit} className="btn-primary">
          {updateExpense.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : isChanged ? `Save ${editedLabels.length} ${editedLabels.length === 1 ? 'change' : 'changes'}` : 'Save Changes'}
        </button>
      </div>

      <ConfirmModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        title="Delete Expense"
        description="Are you sure you want to delete this expense? This action cannot be undone."
        onConfirm={executeDelete}
        isLoading={deleteExpense.isPending}
      />
    </div>
  );
}
