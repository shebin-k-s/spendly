import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { formatINR } from '@/lib/utils';
import type { CategoryBreakdown } from '@/features/expenses/types';
import { useAppSelector } from '@/store/hooks';

interface CategoryPieChartProps {
  breakdown: CategoryBreakdown[];
  total: number;
  isLoading?: boolean;
}

export default function CategoryPieChart({ breakdown, total, isLoading }: CategoryPieChartProps) {
  const showGross = useAppSelector((state) => state.prefs.showGross);

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

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const item = payload[0].payload;
    const hasCashback = (item.cashbackTotal ?? 0) > 0;
    return (
      <div style={{ background: 'hsl(0 0% 8%)', border: '1px solid hsl(0 0% 16%)', borderRadius: '8px', fontSize: '12px', color: 'hsl(0 0% 95%)', padding: '8px 12px' }}>
        <p style={{ color: 'hsl(0 0% 60%)', marginBottom: '4px' }}>{item.icon} {item.name}</p>
        <p>{formatINR(item.net)}</p>
        {showGross && hasCashback && (
          <p style={{ color: 'hsl(0 0% 50%)', textDecoration: 'line-through', fontSize: '10px' }}>{formatINR(item.total)}</p>
        )}
      </div>
    );
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Category Split</p>
      {pieData.length > 0 ? (
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
              {pieData.map((item, index) => (
                <Cell key={index} fill={item.color} />
              ))}
            </Pie>
            <Tooltip cursor={false} content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-8">All expenses covered by cashback</p>
      )}

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2 mt-2">
        {allData.map((item) => (
          <div key={item.categoryId} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-xs text-muted-foreground truncate">{item.icon} {item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
