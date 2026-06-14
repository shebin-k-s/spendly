import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ImageIcon, MessageSquareText } from 'lucide-react';
import { monthLabel, prevMonth, formatINR } from '@/lib/utils';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setDate } from '@/store/dateSlice';
import MonthNavigator from '@/features/expenses/components/MonthNavigator';
import { useMonthlySummary, useExpensesQuery } from '@/features/expenses/hooks/useExpenses';
import MonthSummaryCard from '../components/MonthSummaryCard';
import CategoryBreakdown from '../components/CategoryBreakdown';
import RecentExpenses from '../components/RecentExpenses';
import FutureSpendPlanner from '../components/FutureSpendPlanner';
import { toast } from 'sonner';

async function checkPendingShare(): Promise<{ type: 'image' | 'text'; count: number } | null> {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open('spendly-share');
    const queueRes = await cache.match('/share-queue');
    if (!queueRes) return null;
    const queue: Array<{ type: 'image' | 'text' }> = await queueRes.json();
    if (queue.length > 0) return { type: queue[0].type, count: queue.length };
  } catch {}
  return null;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [pendingShare, setPendingShare] = useState<{ type: 'image' | 'text'; count: number } | null>(null);
  const [showPlanner, setShowPlanner] = useState(false);

  const plannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void checkPendingShare().then(setPendingShare);
  }, []);

  const onPlannerPressStart = () => {
    if (plannerTimerRef.current) return;
    plannerTimerRef.current = setTimeout(() => {
      const nextState = !showPlanner;
      setShowPlanner(nextState);
      navigator.vibrate?.(40);
      toast(nextState ? 'Savings planner on' : 'Savings planner off', { duration: 1500 });
      plannerTimerRef.current = null;
    }, 600);
  };


  const onPlannerPressEnd = () => {
    if (plannerTimerRef.current) {
      clearTimeout(plannerTimerRef.current);
      plannerTimerRef.current = null;
    }
  };

  const { year, month } = useAppSelector((state) => state.date);
  const showGross = useAppSelector((state) => state.prefs.showGross);
  const dispatch = useAppDispatch();
  const prev = prevMonth(year, month);

  const { data: summary, isLoading: summaryLoading } = useMonthlySummary(year, month);
  const { data: prevSummary } = useMonthlySummary(prev.year, prev.month);
  const { data: expenses = [] } = useExpensesQuery(year, month);
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  let dailyDivisor: number;
  let divisorLabel: string;
  if (isCurrentMonth && expenses.length > 0) {
    const firstDay = Math.min(...expenses.map((e) => new Date(e.date).getDate()));
    dailyDivisor = Math.max(1, now.getDate() - firstDay + 1);
    divisorLabel = `${dailyDivisor} day${dailyDivisor !== 1 ? 's' : ''} tracked`;
  } else {
    dailyDivisor = new Date(year, month, 0).getDate();
    divisorLabel = `${dailyDivisor} days`;
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">Overview</p>
          <h1 className="text-xl font-bold">{monthLabel(year, month)}</h1>
        </div>
        <MonthNavigator year={year} month={month} onChange={(y, m) => { dispatch(setDate({ year: y, month: m })); }} />
      </div>

      <div className="page-content space-y-4">
        {/* Pending share banner */}
        {pendingShare && (
          <button
            onClick={() => navigate('/share-pending')}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 active:scale-[0.98] transition-all text-left"
          >
            {pendingShare.type === 'image'
              ? <ImageIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
              : <MessageSquareText className="w-4 h-4 text-amber-400 flex-shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-amber-400">
                {pendingShare.count > 1 ? `${pendingShare.count} pending receipts` : 'Pending receipt'}
              </p>
              <p className="text-[11px] text-amber-400/70 mt-0.5">
                {pendingShare.count > 1
                  ? 'Tap to review them one by one'
                  : pendingShare.type === 'image' ? 'A shared screenshot is waiting to be added' : 'A shared message is waiting to be added'}
              </p>
            </div>
            <span className="text-xs text-amber-400/60 flex-shrink-0">Review →</span>
          </button>
        )}

        {/* Total spend */}
        <MonthSummaryCard
          total={(summary?.total ?? 0) - (summary?.cashbackTotal ?? 0)}
          cashbackTotal={summary?.cashbackTotal}
          count={summary?.count ?? 0}
          prevTotal={prevSummary ? prevSummary.total - (prevSummary.cashbackTotal ?? 0) : undefined}
          isLoading={summaryLoading}
        />

        {/* Quick stats */}
        {summary && summary.count > 0 && (() => {
          const grossTotal = summary.total;
          const netTotal = summary.total - (summary.cashbackTotal ?? 0);
          const hasCashback = showGross && (summary.cashbackTotal ?? 0) > 0;

          const daysInMonth = new Date(year, month, 0).getDate();
          const remainingDays = daysInMonth - now.getDate();
          const dailyAvg = netTotal / dailyDivisor;
          const projectedTotal = Math.round(netTotal + dailyAvg * remainingDays);
          const dailyAvgGross = grossTotal / dailyDivisor;
          const projectedGross = Math.round(grossTotal + dailyAvgGross * remainingDays);

          const spentDays = new Set(expenses.map((e) => e.date)).size;
          const noSpendDays = daysInMonth - spentDays;

          const todayStr = format(now, 'yyyy-MM-dd');
          const todayActual = expenses
            .filter((e) => e.date === todayStr)
            .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);


          return (
            <>
              <div 
                className="grid grid-cols-2 gap-3 select-none"
                onPointerDown={onPlannerPressStart}
                onPointerUp={onPlannerPressEnd}
                onPointerLeave={onPlannerPressEnd}
              >
                <div className="bg-card border border-border rounded-2xl p-4 active:scale-[0.98] transition-transform">
                  <p className="text-xs text-muted-foreground mb-1">Daily Average</p>
                  <p className="text-xl font-bold">{formatINR(Math.round(netTotal / dailyDivisor))}</p>
                  {hasCashback && (
                    <p className="text-xs text-muted-foreground line-through">{formatINR(Math.round(grossTotal / dailyDivisor))}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">{divisorLabel}</p>
                </div>

                {isCurrentMonth ? (
                  <div className="bg-card border border-border rounded-2xl p-4 active:scale-[0.98] transition-transform">
                    <p className="text-xs text-muted-foreground mb-1">Projected</p>
                    <p className="text-xl font-bold">{formatINR(projectedTotal)}</p>
                    {hasCashback && (
                      <p className="text-xs text-muted-foreground line-through">{formatINR(projectedGross)}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">expected spend this month</p>
                  </div>
                ) : (
                  <div className="bg-card border border-border rounded-2xl p-4">
                    <p className="text-xs text-muted-foreground mb-1">No-spend Days</p>
                    <p className="text-xl font-bold">{noSpendDays} <span className="text-sm font-normal text-muted-foreground">/ {daysInMonth}</span></p>
                    <p className="text-[10px] text-muted-foreground mt-1">days with no expenses</p>
                  </div>
                )}
              </div>

              {isCurrentMonth && showPlanner && (
                <FutureSpendPlanner
                  currentTotal={netTotal}
                  daysTracked={dailyDivisor}
                  todayActual={todayActual}
                  daysInMonth={daysInMonth}
                  currentAvg={dailyAvg}
                  currentDay={now.getDate()}
                />
              )}
            </>
          );
        })()}

        {/* Category breakdown */}
        <CategoryBreakdown
          breakdown={summary?.breakdown ?? []}
          total={(summary?.total ?? 0) - (summary?.cashbackTotal ?? 0)}
          isLoading={summaryLoading}
        />

        {/* Recent expenses */}
        <RecentExpenses expenses={expenses} />
      </div>
    </div>
  );
}
