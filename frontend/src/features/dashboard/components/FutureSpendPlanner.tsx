import { useState, useEffect, useRef } from 'react';
import { Plus, Minus, TrendingDown, Target, RefreshCw } from 'lucide-react';
import { formatINR } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface FutureSpendPlannerProps {
  currentTotal: number;
  daysTracked: number;
  todayActual: number;
  daysInMonth: number;
  currentAvg: number;
  currentDay: number;
}

export default function FutureSpendPlanner({
  currentTotal,
  daysTracked,
  todayActual,
  daysInMonth,
  currentAvg,
  currentDay,
}: FutureSpendPlannerProps) {
  const TODAY_STR = new Date().toLocaleDateString('en-CA');
  const STORAGE_KEY = 'spendly_future_planner';

  const [plannedSpends, setPlannedSpends] = useState<number[]>(() => {
    try {
      // Clean up the old bad key format if they exist
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('spendly_planner_')) {
          localStorage.removeItem(key);
        }
      }

      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return [];

      const parsed = JSON.parse(saved);
      if (!parsed.date || !Array.isArray(parsed.spends)) return [];

      // Calculate days elapsed between saved data and today
      const savedDate = new Date(parsed.date);
      const todayDate = new Date(TODAY_STR);
      
      // Use UTC to avoid daylight saving time skips
      const diffTime = Date.UTC(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate()) - 
                       Date.UTC(savedDate.getFullYear(), savedDate.getMonth(), savedDate.getDate());
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 0) {
        // Shift the array left by the number of days elapsed
        return parsed.spends.slice(diffDays);
      } else if (diffDays < 0) {
        return []; // Future date? Just clear it.
      }
      
      return parsed.spends;
    } catch {
      return [];
    }
  });

  const [hasHydrated, setHasHydrated] = useState(() => {
    // If we successfully pulled an array from the new storage logic and it's not empty, we are hydrated.
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;
    try {
      const parsed = JSON.parse(saved);
      if (parsed.date === TODAY_STR && Array.isArray(parsed.spends) && parsed.spends.length > 0) {
        return true; 
      }
      // If dates shifted, we still let the useEffect below push actual today's spend into index 0 if needed, but we already shifted it. 
      // Actually, if we shifted the array and it still has data, that data is purely user-defined from yesterday.
      // But we should let the effect overwrite the [0] with reality if it hasn't hydrated today. Let's force hydration.
      return false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (hasHydrated && plannedSpends.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        date: TODAY_STR,
        spends: plannedSpends
      }));
    }
  }, [plannedSpends, hasHydrated, TODAY_STR]);

  useEffect(() => {
    const today = Number(todayActual);
    const avg = Number(currentAvg);
    const isValidData = !isNaN(today) && !isNaN(avg) && (today !== 0 || avg !== 0);

    if (!hasHydrated && isValidData) {
      const shiftedSpends = plannedSpends.length > 0 ? [...plannedSpends] : [];
      // Only set to today's actual if no prior plan exists. NEVER aggressively overwrite to allow the red warning to function.
      shiftedSpends[0] = shiftedSpends[0] !== undefined ? shiftedSpends[0] : Math.round(today);
      
      setPlannedSpends(shiftedSpends);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        date: TODAY_STR,
        spends: shiftedSpends
      }));
      setHasHydrated(true);
    }

  }, [todayActual, currentAvg, hasHydrated, plannedSpends, TODAY_STR]);

  // Fallback for genuinely 0 spend
  useEffect(() => {

    const timer = setTimeout(() => {
      if (!hasHydrated) {
        setPlannedSpends([0]);
        setHasHydrated(true);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [hasHydrated]);



  const remainingDays = daysInMonth - currentDay; // Days after today

  const handleUpdateSpend = (index: number, value: string) => {
    const newSpends = [...plannedSpends];
    const val = parseFloat(value);
    newSpends[index] = isNaN(val) ? 0 : val;
    setPlannedSpends(newSpends);
  };

  const applyToAll = (value: number) => {
    if (plannedSpends.length <= 1) return;
    const newSpends = [plannedSpends[0], ...Array(plannedSpends.length - 1).fill(value)];
    setPlannedSpends(newSpends);
  };


  const addDay = () => {
    // Can simulate up to (remaining days + today)
    if (plannedSpends.length < remainingDays + 1) {
      const lastValue = plannedSpends[plannedSpends.length - 1];
      setPlannedSpends([...plannedSpends, lastValue]);
    }
  };


  const removeDay = () => {
    if (plannedSpends.length > 1) {
      setPlannedSpends(plannedSpends.slice(0, -1));
    }
  };

  // Calculations
  const simulatedDays = plannedSpends.length;
  // baseTotal is spend up to yesterday
  const safeCurrentTotal = Number(currentTotal || 0);
  const safeTodayActual = Number(todayActual || 0);
  const safeCurrentAvg = Number(currentAvg || 0);
  const safeCurrentDay = Number(currentDay || 1);

  const baseTotal = safeCurrentTotal - safeTodayActual;
  const totalPlannedInSim = plannedSpends.reduce((a, b) => a + (Number(b) || 0), 0);
  
  // Days covered by (calendar days excluding today) + simulation
  const lastSimulatedDay = (safeCurrentDay - 1) + simulatedDays;
  const remainingAfterSim = Math.max(0, daysInMonth - lastSimulatedDay);
  
  const originalProjected = safeCurrentTotal + safeCurrentAvg * (daysInMonth - safeCurrentDay);
  const newProjectedTotal = baseTotal + totalPlannedInSim + (safeCurrentAvg * remainingAfterSim);
  
  const safeOriginalProjected = isNaN(originalProjected) ? 0 : originalProjected;
  const safeNewProjectedTotal = isNaN(newProjectedTotal) ? 0 : newProjectedTotal;
  
  const savingsAmount = safeOriginalProjected - safeNewProjectedTotal;
  const newDailyAvg = safeNewProjectedTotal / (daysInMonth || 1);

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary">
          <Target className="w-4 h-4" />
          <h3 className="text-sm font-bold uppercase tracking-wider">Spend Planner</h3>
        </div>
        <div className="flex items-center gap-1.5 bg-secondary rounded-lg px-2 py-1">
          <button onClick={removeDay} className="p-0.5 hover:text-primary transition-colors disabled:opacity-30" disabled={plannedSpends.length <= 1}>
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-bold min-w-[3ch] text-center">{simulatedDays}d</span>
          <button onClick={addDay} className="p-0.5 hover:text-primary transition-colors disabled:opacity-30" disabled={simulatedDays >= remainingDays + 1}>
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>

      <div className="space-y-3">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase">Target Spend (Including Today)</label>
        <div className="flex flex-wrap gap-3">
          {plannedSpends.map((spend, i) => (
            <div key={i} className="flex-1 min-w-[80px] space-y-1">
              <p className="text-[10px] text-muted-foreground italic truncate">
                {i === 0 
                  ? `Today (${new Date(Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` 
                  : i === 1 
                    ? `Tomorrow (${new Date(Date.now() + 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` 
                    : new Date(Date.now() + i * 86400000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </p>
              <div className="relative">


                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">₹</span>
                <input
                  type="number"
                  value={spend.toString()}
                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  onChange={(e) => {
                    let val = e.target.value;
                    // Remove leading zeros robustly
                    if (val.length > 1 && val.startsWith('0') && !val.includes('.')) {
                      val = val.replace(/^0+/, '');
                    }
                    handleUpdateSpend(i, val);
                  }}


                  placeholder="0"
                  className={cn(
                    "w-full bg-background border rounded-xl pl-6 pr-3 py-2 text-sm font-bold focus:outline-none focus:ring-1",
                    i === 0 && spend < safeTodayActual ? "border-destructive focus:ring-destructive text-destructive" : "border-border focus:ring-primary"
                  )}
                />


              </div>
              {i === 0 && spend < safeTodayActual && (
                <p className="text-[9px] text-destructive italic font-medium leading-tight">
                  Goal is lower than ₹{Math.round(safeTodayActual)} already spent.
                </p>
              )}
              {i === 1 && plannedSpends.length > 2 && (
                <button 
                  onClick={() => applyToAll(spend)}
                  className="flex items-center gap-1 mt-1.5 text-[9px] text-primary hover:text-primary/80 transition-colors font-bold uppercase tracking-tight active:scale-95"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  Sync all
                </button>
              )}
            </div>
          ))}

        </div>
      </div>

      <div className="pt-2 border-t border-border flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
            New Projected Total
          </p>

          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold">{formatINR(Math.round(safeNewProjectedTotal))}</span>
            {Math.round(savingsAmount) !== 0 && !isNaN(savingsAmount) && (
              <span className={cn(
                "text-xs font-medium px-1.5 py-0.5 rounded-md",
                savingsAmount > 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
              )}>
                {savingsAmount > 0 ? 'Saved ' : 'Over '}{formatINR(Math.abs(Math.round(savingsAmount)))}
              </span>
            )}
          </div>
        </div>
        <div className="text-right space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase">New Daily Avg</p>
          <p className="text-lg font-bold text-primary">{formatINR(Math.round(newDailyAvg))}</p>
        </div>
      </div>

      {savingsAmount > 0 && Math.round(savingsAmount) !== 0 && !isNaN(savingsAmount) && (
        <div className="bg-success/5 border border-success/10 rounded-xl p-3 flex items-start gap-3">
          <TrendingDown className="w-4 h-4 text-success shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-success-foreground/80">
            Great plan! Cutting back for the next {simulatedDays} days reduces your monthly projection by <span className="font-bold">{formatINR(Math.round(savingsAmount))}</span> and keeps your average low.
          </p>
        </div>
      )}

    </div>
  );
}
