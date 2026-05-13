import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Receipt, Tag, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import AnimatedOutlet from './AnimatedOutlet';

const NAV_TABS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/expenses', icon: Receipt, label: 'Expenses' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/categories', icon: Tag, label: 'Categories' },
];

export default function Layout() {
  return (
    <div className="h-full flex flex-col bg-background sm:max-w-md sm:mx-auto sm:border-x sm:border-border sm:shadow-2xl relative overflow-hidden">
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative disable-scrollbars">
        <AnimatedOutlet />
      </main>

      {/* Bottom navigation */}
      <nav className="shrink-0 bg-background border-t border-border safe-bottom relative z-50">
        <div className="grid grid-cols-4 max-w-full">
          {NAV_TABS.map(({ to, icon: Icon, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 py-3 px-2 text-[10px] font-medium transition-colors relative',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('w-5 h-5 relative z-10 transition-transform duration-300', isActive && 'scale-110 drop-shadow-[0_0_6px_hsl(var(--primary)/0.6)]')} />
                  <span className="relative z-10">{label}</span>
                  {isActive && (
                    <div className="absolute inset-0 bg-primary/10 rounded-xl m-1 z-0 animate-in fade-in zoom-in duration-300" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
