import { useState, useRef } from 'react';
import { X, Sparkles, Loader2, Trash2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Search, UserPlus, LogOut, Check, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { expensesApi } from '../api/expensesApi';
import { useCategoriesQuery } from '@/features/categories/hooks/useCategories';
import { DateTimePicker } from '@/components/DateTimePicker';
import { usePeople } from '@/features/people/hooks/usePeople';
import { peopleApi } from '@/features/people/api/peopleApi';
import { useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { cn, formatINR } from '@/lib/utils';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { CategoryPicker } from '@/features/categories/components/CategoryPicker';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedItem {
  amount: string;
  description: string;
  date: string | null;
  time: string | null;
  category_id: string | null;
  category_name?: string | null;
  note?: string | null;
  cashback?: string | null;
  suggested_flow: 'expense' | 'transfer';
  transfer_person?: string | null;
  transfer_phone?: string | null;
  transfer_direction?: 'sent' | 'received' | null;
  _saved?: boolean;
  _saving?: boolean;
  _error?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onAllSaved?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function BulkParseModal({ open, onClose, onAllSaved }: Props) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [searchingPersonIdx, setSearchingPersonIdx] = useState<number | null>(null);
  const [personSearch, setPersonSearch] = useState('');
  const [searchingCategoryIdx, setSearchingCategoryIdx] = useState<number | null>(null);
  const [categorySearch, setCategorySearch] = useState('');
  const queryClient = useQueryClient();
  const { data: people = [] } = usePeople();
  const categoriesQuery = useCategoriesQuery();
  const categories = categoriesQuery.data || [];
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleY = useRef<number | null>(null);
  const dragY = useRef(0);

  // Swipe-to-dismiss
  const onDragStart = (e: React.PointerEvent) => {
    handleY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (handleY.current === null || !sheetRef.current) return;
    let d = e.clientY - handleY.current;
    if (d < 0) d = 0;
    dragY.current = d;
    sheetRef.current.style.transition = 'none';
    sheetRef.current.style.transform = `translateY(${d}px)`;
  };
  const onDragEnd = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (!sheetRef.current) return;
    if (dragY.current > 120) {
      handleClose();
    } else {
      sheetRef.current.style.transition = 'transform 0.35s cubic-bezier(0.32,0.72,0,1)';
      sheetRef.current.style.transform = 'translateY(0)';
    }
    handleY.current = null;
    dragY.current = 0;
  };

  const handleClose = () => {
    setText('');
    setStatus('idle');
    setItems([]);
    onClose();
  };

  const handleParse = async () => {
    if (!text.trim() || status === 'loading') return;
    setStatus('loading');
    try {
      const res = await expensesApi.parseBulkText(text.trim());
      const parsed: ParsedItem[] = res.items.map((raw) => ({
        amount: typeof raw.amount === 'string' ? raw.amount : '',
        description: typeof raw.description === 'string' ? raw.description : '',
        date: typeof raw.date === 'string' ? raw.date : today(),
        time: typeof raw.time === 'string' ? raw.time : null,
        category_id: typeof raw.category_id === 'string' ? raw.category_id : null,
        category_name: typeof raw.category_name === 'string' ? raw.category_name : null,
        note: typeof raw.note === 'string' ? raw.note : null,
        cashback: typeof raw.cashback === 'string' ? raw.cashback : null,
        suggested_flow: raw.suggested_flow === 'transfer' ? 'transfer' : 'expense',
        transfer_person: typeof raw.transfer_person === 'string' ? raw.transfer_person : null,
        transfer_phone: typeof raw.transfer_phone === 'string' ? raw.transfer_phone : null,
        transfer_direction: (raw.transfer_direction === 'sent' || raw.transfer_direction === 'received')
          ? raw.transfer_direction : null,
      }));
      setItems(parsed);
      setStatus('done');
    } catch {
      setStatus('error');
    }
  };

  const updateItem = (idx: number, patch: Partial<ParsedItem>) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  // Saves a single item. Returns true on success. Does NOT show a toast or
  // invalidate expense queries — the caller does that once for the whole batch.
  const saveOne = async (idx: number): Promise<boolean> => {
    const item = items[idx];
    if (!item.amount || (!item.description && !item.transfer_person)) return !!item._saved;
    if (item._saving || item._saved) return !!item._saved;

    updateItem(idx, { _saving: true, _error: false });

    try {
      if (item.suggested_flow === 'transfer') {
        const personName = item.transfer_person?.trim();
        if (!personName) throw new Error('Person name required for transfer');

        // 1. Find or Create Person
        let person = people.find(p => p.name.toLowerCase() === personName.toLowerCase());
        if (!person) {
          person = await peopleApi.createPerson({
            name: personName,
            phoneNumber: item.transfer_phone?.trim() || undefined
          });
          // Invalidate people so next item can find this one
          await queryClient.invalidateQueries({ queryKey: ['people'] });
        }

        // 2. Add Transaction
        await peopleApi.addTransaction(person.id, {
          amount: parseFloat(item.amount),
          type: item.transfer_direction === 'received' ? 'RETURNED' : 'GIVEN',
          date: item.date || today(),
          note: (item.description || item.note || '').trim() || undefined
        });
      } else {
        // Normal Expense — call the API directly so the per-item success toast
        // from useCreateExpense doesn't fire once per row.
        await expensesApi.create({
          amount: parseFloat(item.amount),
          description: item.description.trim(),
          date: item.date || today(),
          time: item.time || undefined,
          note: item.note?.trim() || undefined,
          categoryId: item.category_id || undefined,
          cashback: item.cashback ? parseFloat(item.cashback) : undefined,
        });
      }

      updateItem(idx, { _saved: true, _saving: false });
      return true;
    } catch (err) {
      console.error('Failed to save bulk item:', err);
      updateItem(idx, { _saving: false, _error: true });
      return false;
    }
  };

  const saveAll = async () => {
    const pending = items
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => !it._saved && !!it.amount && (!!it.description || !!it.transfer_person));
    if (pending.length === 0) return;

    const results = await Promise.all(pending.map(({ idx }) => saveOne(idx)));
    const savedNow = results.filter(Boolean).length;
    const failed = results.length - savedNow;

    // Refresh expense + people lists once for the whole batch — refetchType:'all'
    // so cached/unmounted screens (dashboard totals, balances) refetch now too.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['expenses'], refetchType: 'all' }),
      queryClient.invalidateQueries({ queryKey: ['people'], refetchType: 'all' }),
    ]);

    if (failed > 0) {
      toast.error(`${savedNow} saved, ${failed} failed — check the highlighted items`);
      return; // keep the sheet open so the user can retry the failures
    }

    toast.success(`${savedNow} item${savedNow !== 1 ? 's' : ''} saved!`);
    onAllSaved?.();
    handleClose();
  };

  const savedCount = items.filter(it => it._saved).length;
  const totalCount = items.length;
  const allSaved = totalCount > 0 && savedCount === totalCount;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="relative z-10 bg-background rounded-t-3xl overflow-hidden flex flex-col"
        style={{ maxHeight: '95dvh' }}
      >
        {/* Drag handle */}
        <div
          className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
        >
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 pb-3 pt-1 border-b border-border">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">Bulk Add Expenses</p>
            <p className="text-[10px] text-muted-foreground">Type all at once — AI splits them for you</p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center active:scale-90 transition-all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 disable-scrollbars">

          {/* Input area — only visible before parse */}
          {status !== 'done' && (
            <div className="space-y-3">
              <textarea
                value={text}
                onChange={e => {
                  let val = e.target.value;
                  // If starting a fresh input, auto-prefix with "1. "
                  if (val.length === 1 && !val.includes('.')) {
                    val = `1. ${val}`;
                  }
                  setText(val);
                  if (status !== 'idle') setStatus('idle');
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    const target = e.currentTarget;
                    const start = target.selectionStart;
                    const end = target.selectionEnd;
                    const lines = text.split('\n');
                    const currentLineIdx = text.substring(0, start).split('\n').length - 1;
                    const currentLine = lines[currentLineIdx];

                    // Match leading number "N. "
                    const match = currentLine.match(/^(\d+)\.\s/);
                    let nextPrefix = '\n';
                    if (match) {
                      const nextNum = parseInt(match[1], 10) + 1;
                      nextPrefix = `\n${nextNum}. `;
                    } else if (currentLine.trim()) {
                      // If user typed without number, start numbering on next line
                      nextPrefix = `\n${lines.length + 1}. `;
                    }

                    const newText = text.substring(0, start) + nextPrefix + text.substring(end);
                    setText(newText);

                    // Set cursor after the new prefix
                    setTimeout(() => {
                      target.selectionStart = target.selectionEnd = start + nextPrefix.length;
                    }, 0);
                  } else if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    void handleParse();
                  }
                }}
                placeholder={'Each line is a new transaction. AI will ignore labels like 1., 2.\n\n1. Coffee 20\n2. Lunch 200, tea 10\n3. Dinner 500'}
                rows={8}
                className="form-input resize-none text-sm leading-relaxed"
              />
              {status === 'error' && (
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20">
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                  <p className="text-xs text-destructive font-medium">Couldn't parse — try again or be more specific</p>
                </div>
              )}
              <button
                onClick={() => void handleParse()}
                disabled={!text.trim() || status === 'loading'}
                className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              >
                {status === 'loading'
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Parsing…</>
                  : <><Sparkles className="w-4 h-4" /> Parse All Expenses</>
                }
              </button>
            </div>
          )}

          {/* Parsed items */}
          {status === 'done' && items.length > 0 && (
            <div className="space-y-3">
              {/* Re-parse pill */}
              <button
                onClick={() => { setStatus('idle'); setItems([]); }}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-secondary text-muted-foreground text-xs font-semibold active:scale-[0.98] transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Re-parse
              </button>

              {items.map((item, idx) => {
                const cat = categories.find(c => c.id === item.category_id);
                const isSaved = !!item._saved;

                return (
                  <div
                    key={idx}
                    className={cn(
                      'rounded-2xl border transition-all p-3.5 space-y-3.5',
                      isSaved
                        ? 'bg-success/5 border-success/20 opacity-70'
                        : item._error
                          ? 'bg-destructive/5 border-destructive/20'
                          : 'bg-card border-border'
                    )}
                  >
                    {/* Header: Description & Delete */}
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0',
                        isSaved ? 'bg-success/15' : (item.suggested_flow === 'transfer' ? 'bg-blue-500/10' : 'bg-secondary')
                      )}>
                        {isSaved
                          ? <CheckCircle2 className="w-4 h-4 text-success" />
                          : item.suggested_flow === 'transfer'
                            ? <span className="text-blue-400">🤝</span>
                            : cat ? <span>{cat.icon}</span> : <span className="text-muted-foreground text-sm">💰</span>
                        }
                      </div>

                      <div className="flex-1 min-w-0">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 block">
                          {item.suggested_flow === 'transfer' ? 'Note / Context' : 'Description'}
                        </label>
                        {isSaved ? (
                          <p className="text-sm font-semibold truncate text-success/80">{item.description}</p>
                        ) : (
                          <div className="flex flex-col">
                            <input
                              className="bg-transparent border-none p-0 text-sm font-semibold focus:ring-0 focus:outline-none placeholder:text-muted-foreground/30"
                              value={item.description}
                              onChange={e => updateItem(idx, { description: e.target.value })}
                              placeholder={item.suggested_flow === 'transfer' ? "What was it for?" : "What was it?"}
                            />
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={cn(
                                'text-[9px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded-md border',
                                item.suggested_flow === 'transfer' 
                                  ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' 
                                  : 'bg-primary/10 border-primary/20 text-primary'
                              )}>
                                {item.suggested_flow}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {!isSaved && (
                        <button
                          onClick={() => removeItem(idx)}
                          className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center active:scale-90 transition-all shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      )}
                    </div>

                    {/* Numeric fields (Conditional Cashback) */}
                    <div className={cn(
                      "grid gap-3 transition-all duration-300",
                      item.suggested_flow === 'transfer' ? "grid-cols-1" : "grid-cols-2"
                    )}>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Amount (₹)</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          disabled={isSaved}
                          className="w-full bg-secondary/50 border-none rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-0 disabled:opacity-50"
                          value={item.amount}
                          onChange={e => updateItem(idx, { amount: e.target.value })}
                          placeholder="0.00"
                        />
                      </div>
                      {item.suggested_flow !== 'transfer' && (
                        <div className="space-y-1 animate-in fade-in slide-in-from-right-2 duration-300">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cashback (₹)</label>
                          <input
                            type="number"
                            inputMode="decimal"
                            disabled={isSaved}
                            className="w-full bg-secondary/50 border-none rounded-xl px-3 py-2 text-sm font-bold text-blue-500 placeholder:text-blue-500/30 focus:outline-none focus:ring-0 disabled:opacity-50"
                            value={item.cashback || ''}
                            onChange={e => updateItem(idx, { cashback: e.target.value })}
                            placeholder="0.00"
                          />
                        </div>
                      )}
                    </div>

                    {/* Date/Time field (Custom selector) */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Date & Time</label>
                      <DateTimePicker
                        date={item.date || today()}
                        time={item.time}
                        disabled={isSaved}
                        onChange={(d, t) => updateItem(idx, { date: d, time: t })}
                      />
                    </div>

                    {/* Transfer details (Always visible if it's a transfer) */}
                    {!isSaved && item.suggested_flow === 'transfer' && (() => {
                      const matched = people.find(p => p.name.toLowerCase() === (item.transfer_person || '').trim().toLowerCase());
                      
                      return (
                        <div className="space-y-2 p-3 rounded-2xl bg-blue-500/5 border border-blue-500/10">
                          <div className="flex items-center justify-between">
                            <label className="text-[9px] font-bold text-blue-400/80 uppercase tracking-tighter">Person / Contact</label>
                            <button 
                              onClick={() => {
                                setSearchingPersonIdx(idx);
                                setPersonSearch('');
                              }}
                              className="px-2 py-1 rounded-lg bg-blue-500/10 text-[10px] font-bold text-blue-400 flex items-center gap-1 active:scale-95 transition-all"
                            >
                              <Search className="w-2.5 h-2.5" />
                              Select Existing
                            </button>
                          </div>

                          <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
                            <div className="space-y-1">
                              <input
                                className="w-full bg-transparent border-none p-0 text-sm font-bold text-foreground focus:ring-0 focus:outline-none placeholder:text-muted-foreground/30"
                                value={item.transfer_person || ''}
                                onChange={e => updateItem(idx, { transfer_person: e.target.value })}
                                placeholder="Name"
                              />
                              {item.transfer_person?.trim() && (
                                matched ? (
                                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-success/5 text-success text-[9px] font-black uppercase tracking-tight animate-in fade-in zoom-in duration-300">
                                    <Check className="w-3 h-3" />
                                    Existing contact {matched.balance !== 0 && (
                                      <span className="opacity-70">
                                        (₹{matched.balance})
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/5 text-primary text-[9px] font-black uppercase tracking-tight animate-in fade-in zoom-in duration-300">
                                    <UserPlus className="w-3 h-3" />
                                    New Contact
                                  </div>
                                )
                              )}
                            </div>
                            <div className="space-y-1 flex flex-col items-end">
                              <div className="grid grid-cols-2 gap-1 bg-secondary/50 p-0.5 rounded-xl">
                                <button
                                  onClick={() => updateItem(idx, { transfer_direction: 'sent' })}
                                  className={cn(
                                    'px-3 py-1 rounded-[10px] text-[10px] font-black uppercase transition-all flex items-center gap-1',
                                    item.transfer_direction === 'sent' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
                                  )}
                                >
                                  <ArrowUpRight className="w-2.5 h-2.5" />
                                  Gave
                                </button>
                                <button
                                  onClick={() => updateItem(idx, { transfer_direction: 'received' })}
                                  className={cn(
                                    'px-3 py-1 rounded-[10px] text-[10px] font-black uppercase transition-all flex items-center gap-1',
                                    item.transfer_direction === 'received' ? 'bg-success text-success-foreground shadow-sm' : 'text-muted-foreground'
                                  )}
                                >
                                  <ArrowDownLeft className="w-2.5 h-2.5" />
                                  Got
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Meta info (Status only view) */}
                    {!isSaved && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {/* Flow Type Toggle */}
                        <button
                          onClick={() => updateItem(idx, { suggested_flow: item.suggested_flow === 'expense' ? 'transfer' : 'expense' })}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold active:scale-95 transition-all',
                            item.suggested_flow === 'transfer' ? 'bg-blue-500/20 text-blue-400' : 'bg-secondary text-muted-foreground'
                          )}
                        >
                          {item.suggested_flow === 'transfer' ? 'Transfer' : 'Expense'}
                        </button>

                        {item.suggested_flow !== 'transfer' && (
                          <>
                            {/* Category Modal Trigger */}
                            <button
                              onClick={() => {
                                setSearchingCategoryIdx(idx);
                                setCategorySearch('');
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-[11px] font-semibold active:scale-95 transition-all animate-in fade-in duration-300"
                            >
                              {cat ? (
                                <>
                                  <span>{cat.icon}</span>
                                  <span>{cat.name}</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-muted-foreground">🏷️</span>
                                  <span className="text-muted-foreground">Uncategorized</span>
                                </>
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Notes (Small inline) */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Note</label>
                      <textarea
                        disabled={isSaved}
                        rows={1}
                        className="w-full bg-transparent border-none p-0 text-sm text-foreground focus:ring-0 focus:outline-none placeholder:text-muted-foreground/30 italic resize-none leading-relaxed break-words overflow-hidden"
                        value={item.note || ''}
                        ref={el => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }}
                        onChange={e => updateItem(idx, { note: e.target.value })}
                        placeholder="Add a small note..."
                      />
                    </div>

                    {item._error && (
                      <p className="text-[10px] text-destructive font-bold flex items-center gap-1">
                        <AlertCircle className="w-2.5 h-2.5" />
                        Save failed — please try again
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {status === 'done' && items.length === 0 && (
            <div className="flex flex-col items-center py-10 gap-3 text-muted-foreground">
              <AlertCircle className="w-8 h-8" />
              <p className="text-sm">No expenses found — try again</p>
              <button
                onClick={() => setStatus('idle')}
                className="text-primary text-sm font-semibold"
              >
                Re-parse
              </button>
            </div>
          )}
        </div>

        {/* Footer save bar */}
        {status === 'done' && items.length > 0 && (
          <div className="px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] bg-background">
            {allSaved ? (
              <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-success/10 border border-success/20">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span className="text-sm font-semibold text-success">All saved!</span>
              </div>
            ) : (
              <button
                onClick={() => void saveAll()}
                disabled={items.every(it => it._saved)}
                className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              >
                {items.some(it => it._saving)
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                  : <>
                    <CheckCircle2 className="w-4 h-4" />
                    Save All {savedCount > 0 ? `(${savedCount}/${totalCount} done)` : `${totalCount} Expense${totalCount !== 1 ? 's' : ''}`}
                  </>
                }
              </button>
            )}
          </div>
        )}
        {/* Person Picker Bottom Modal (Using Reusable BottomSheet) */}
        <BottomSheet
          open={searchingPersonIdx !== null}
          onOpenChange={open => !open && setSearchingPersonIdx(null)}
          maxHeight="75vh"
          header={(
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <Dialog.Title className="text-base font-bold">Select Contact</Dialog.Title>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest leading-none mt-0.5">Existing People</p>
              </div>
            </div>
          )}
        >
          <div className="px-4 pb-6 space-y-4 min-h-[60vh] flex flex-col">
            <div className="relative mt-2">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                placeholder="Search name or phone..."
                className="w-full bg-secondary border border-border rounded-xl pl-10 pr-10 py-2.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary transition-all [&::-webkit-search-cancel-button]:hidden"
                value={personSearch}
                onChange={e => setPersonSearch(e.target.value)}
                autoFocus
              />
              {personSearch && (
                <button 
                  onClick={() => setPersonSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex-1 space-y-2">
              {(() => {
                const filtered = people.filter(p => 
                  !personSearch || 
                  p.name.toLowerCase().includes(personSearch.toLowerCase()) || 
                  p.phoneNumber?.includes(personSearch)
                );

                if (filtered.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-20 text-center opacity-50 space-y-3">
                      <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto text-muted-foreground">
                        <Search className="w-8 h-8 opacity-20" />
                      </div>
                      <p className="text-sm font-medium">No contacts found</p>
                      <p className="text-[10px] uppercase tracking-widest leading-relaxed px-10">
                        Try searching for a different name or phone number
                      </p>
                    </div>
                  );
                }

                return filtered.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      updateItem(searchingPersonIdx!, { transfer_person: p.name });
                      setSearchingPersonIdx(null);
                    }}
                    className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-secondary/30 border border-transparent hover:border-primary/20 hover:bg-primary/5 active:scale-[0.98] transition-all group"
                  >
                     <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center text-xl font-black text-primary shadow-sm group-hover:scale-110 transition-transform">
                        {p.name[0].toUpperCase()}
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-[15px] text-foreground tracking-tight">{p.name}</p>
                        {p.phoneNumber && <p className="text-[11px] text-muted-foreground font-medium">{p.phoneNumber}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-sm font-black tracking-tight", p.balance < 0 ? "text-destructive" : "text-primary")}>
                        {formatINR(p.balance)}
                      </p>
                      <p className="text-[8px] font-bold text-muted-foreground uppercase opacity-60">Session Balance</p>
                    </div>
                  </button>
                ));
              })()}
            </div>
          </div>
        </BottomSheet>

        {/* Unified Category Picker Bottom Sheet */}
        <CategoryPicker
          open={searchingCategoryIdx !== null}
          onOpenChange={open => !open && setSearchingCategoryIdx(null)}
          selectedIds={items[searchingCategoryIdx!]?.category_id ? [items[searchingCategoryIdx!]!.category_id!] : []}
          onSelect={(id, name) => {
            updateItem(searchingCategoryIdx!, { category_id: id, category_name: name });
          }}
          title="Select Category"
        />
      </div>
    </div>
  );
}
