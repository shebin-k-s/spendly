import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { formatINR } from '@/lib/utils';
import type { CategoryBreakdown } from '@/features/expenses/types';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { clearFilters, toggleCategoryId, setFilterOpen } from '@/store/filterSlice';

const VISIBLE_COUNT = 6;

interface CategoryPieChartProps {
  breakdown: CategoryBreakdown[];
  total: number;
  isLoading?: boolean;
}

export default function CategoryPieChart({ breakdown, total, isLoading }: CategoryPieChartProps) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const showGross = useAppSelector((state) => state.prefs.showGross);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleCategoryClick = (categoryId: string) => {
    dispatch(clearFilters());
    dispatch(toggleCategoryId(categoryId));
    dispatch(setFilterOpen(true));
    navigate('/expenses');
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4 opacity-50">Category Split</p>
        <div className="flex justify-center mb-6 mt-8">
          <div className="w-[160px] h-[160px] rounded-full bg-secondary animate-pulse" />
        </div>
        <div className="grid grid-cols-2 gap-4 mt-8">
          {[1, 2, 3, 4].map((i) => (
             <div key={i} className="h-3 bg-secondary/70 rounded animate-pulse w-full max-w-[100px]" />
          ))}
        </div>
      </div>
    );
  }

  if (breakdown.length === 0) return null;

  const allData = breakdown.map((item) => ({
    ...item,
    net: item.total - (item.cashbackTotal ?? 0),
  }));

  // Pie chart can't render negative values — only include categories with positive net spend
  const pieData = allData.filter((item) => item.net > 0);
  // What the donut visually represents (same denominator the ring itself sums to),
  // so the center total and each row's % always agree with what's drawn.
  const netTotal = pieData.reduce((sum, item) => sum + item.net, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const item = payload[0].payload;
    const hasCashback = (item.cashbackTotal ?? 0) > 0;
    return (
      <div style={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px', color: 'hsl(var(--popover-foreground))', padding: '8px 12px' }}>
        <p style={{ color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}>{item.icon} {item.name}</p>
        <p>{formatINR(item.net)}</p>
        {showGross && hasCashback && (
          <p style={{ color: 'hsl(var(--muted-foreground))', textDecoration: 'line-through', fontSize: '10px' }}>{formatINR(item.total)}</p>
        )}
      </div>
    );
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Category Split</p>
      {pieData.length > 0 ? (
        <div className="relative">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="net"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
              >
                {pieData.map((item) => (
                  <Cell
                    key={item.categoryId}
                    fill={item.color}
                    opacity={hoveredId && hoveredId !== item.categoryId ? 0.35 : 1}
                    style={{ transition: 'opacity 150ms' }}
                  />
                ))}
              </Pie>
              <Tooltip cursor={false} content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Donut hole was empty space — put the month's total there instead */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-lg font-bold">{formatINR(netTotal)}</span>
            <span className="text-[10px] text-muted-foreground">this month</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-8">All expenses covered by cashback</p>
      )}

      {/* Legend — two per row. Capped to the top few by default so a month
          with many categories doesn't turn into a wall of tiny rows. */}
      <div className="grid grid-cols-2 gap-2 mt-2">
        {(expanded ? allData : allData.slice(0, VISIBLE_COUNT)).map((item) => (
          <button
            key={item.categoryId}
            type="button"
            onClick={() => handleCategoryClick(item.categoryId)}
            onMouseEnter={() => setHoveredId(item.categoryId)}
            onMouseLeave={() => setHoveredId(null)}
            className="flex flex-col items-start gap-0.5 py-1.5 px-1.5 -mx-1.5 rounded-lg hover:bg-secondary/30 active:bg-secondary/30 transition-colors text-left min-w-0"
          >
            <div className="flex items-center gap-1.5 min-w-0 w-full">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-xs text-muted-foreground truncate">{item.icon} {item.name}</span>
            </div>
            <div className="flex items-baseline gap-1.5 pl-3.5">
              <span className="text-xs font-semibold">{formatINR(item.net)}</span>
              <span className="text-[10px] text-muted-foreground">({item.count})</span>
              {showGross && (item.cashbackTotal ?? 0) > 0 && (
                <span className="text-[10px] text-muted-foreground line-through">{formatINR(item.total)}</span>
              )}
            </div>
          </button>
        ))}
      </div>

      {allData.length > VISIBLE_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-center text-xs text-muted-foreground py-2 mt-1 hover:text-foreground transition-colors"
        >
          {expanded ? 'Show less' : `Show all ${allData.length} categories`}
        </button>
      )}
    </div>
  );
}
