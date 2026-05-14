import { useRef, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { currentYearMonth } from '@/lib/utils';
import type { MonthlyAnalytic } from '@/features/expenses/types';

interface MonthlyTrendChartProps {
  data: MonthlyAnalytic[];
  isLoading?: boolean;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function MonthlyTrendChart({ data, isLoading }: MonthlyTrendChartProps) {
  const { year: currentYear, month: currentMonth } = currentYearMonth();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && data.length > 0) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [data]);

  if (isLoading) {
    return <div className="h-48 bg-card rounded-2xl animate-pulse border border-border" />;
  }

  const chartData = data.map((d) => ({
    label: `${MONTH_SHORT[d.month - 1]} '${d.year.toString().slice(2)}`,
    total: d.total,
    isCurrent: d.year === currentYear && d.month === currentMonth,
  }));

  const maxTotal = Math.max(...data.map((d) => d.total), 1);

  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-col">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Monthly Trend</p>

      {/* Scrollable Wrapper */}
      <div
        ref={scrollRef}
        className="overflow-x-auto disable-scrollbars -mx-4 px-4 scroll-smooth"
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
              <YAxis hide domain={[0, maxTotal * 1.15]} />
              <Tooltip
                cursor={{ fill: 'hsl(0 0% 12%)' }}
                contentStyle={{
                  background: 'hsl(0 0% 8%)',
                  border: '1px solid hsl(0 0% 16%)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'hsl(0 0% 95%)',
                }}
                itemStyle={{ color: 'hsl(0 0% 95%)' }}
                labelStyle={{ color: 'hsl(0 0% 60%)' }}
                formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Spent']}
              />
              <Bar dataKey="total" radius={[6, 6, 0, 0]}>
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
