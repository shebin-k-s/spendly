import { useRef, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { currentYearMonth } from '@/lib/utils';
import { useSwipeGesture } from '@/context/SwipeGestureContext';
import type { MonthlyAnalytic } from '@/features/expenses/types';
import { useAppSelector } from '@/store/hooks';

interface MonthlyTrendChartProps {
  data: MonthlyAnalytic[];
  isLoading?: boolean;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function MonthlyTrendChart({ data, isLoading }: MonthlyTrendChartProps) {
  const { year: currentYear, month: currentMonth } = currentYearMonth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { disableGlobalSwipe, enableGlobalSwipe } = useSwipeGesture();
  const showGross = useAppSelector((state) => state.prefs.showGross);

  useEffect(() => {
    if (scrollRef.current && data.length > 0) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [data]);

  // Clean up in case component unmounts while user is interacting
  useEffect(() => {
    return () => {
      enableGlobalSwipe();
    };
  }, [enableGlobalSwipe]);

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-4 flex flex-col">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4 opacity-50">Monthly Trend</p>
        <div className="h-[160px] w-full bg-secondary rounded-lg animate-pulse" />
      </div>
    );
  }

  const chartData = data.map((d) => ({
    label: `${MONTH_SHORT[d.month - 1]} '${d.year.toString().slice(2)}`,
    net: d.total - (d.cashbackTotal ?? 0),
    barHeight: Math.max(0, d.total - (d.cashbackTotal ?? 0)),
    gross: d.total,
    isCurrent: d.year === currentYear && d.month === currentMonth,
  }));

  const maxNet = Math.max(...chartData.map((d) => d.barHeight), 1);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const { net, gross } = payload[0].payload as { net: number; gross: number };
    const hasCashback = gross > net;
    return (
      <div style={{ background: 'hsl(0 0% 8%)', border: '1px solid hsl(0 0% 16%)', borderRadius: '8px', fontSize: '12px', color: 'hsl(0 0% 95%)', padding: '8px 12px' }}>
        <p style={{ color: 'hsl(0 0% 60%)', marginBottom: '4px' }}>{label}</p>
        <p>₹{net.toLocaleString('en-IN')}</p>
        {showGross && hasCashback && (
          <p style={{ color: 'hsl(0 0% 50%)', textDecoration: 'line-through', fontSize: '10px' }}>₹{gross.toLocaleString('en-IN')}</p>
        )}
      </div>
    );
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-col">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Monthly Trend</p>

      {/* Scrollable Wrapper */}
      <div
        ref={scrollRef}
        className="overflow-x-auto overscroll-x-contain disable-scrollbars -mx-4 px-4 scroll-smooth"
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
      >
        <div style={{ width: Math.max(chartData.length * 45, 300), height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="30%">
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'hsl(0 0% 50%)' }}
              />
              <YAxis hide domain={[0, maxNet * 1.15]} />
              <Tooltip cursor={{ fill: 'hsl(0 0% 12%)' }} content={<CustomTooltip />} />
              <Bar dataKey="barHeight" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.isCurrent ? 'hsl(263 70% 65%)' : 'hsl(263 70% 65% / 0.35)'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
