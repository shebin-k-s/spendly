import { useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface CashbackVisibilityIconProps {
  showGross: boolean;
}

const TOOLTIP_AUTOHIDE_MS = 1800;

/**
 * Small persistent indicator of the shared "show gross/cashback" preference.
 * Hover shows the tooltip on desktop; tapping the icon shows it briefly on
 * mobile, where there's no hover to rely on.
 */
export function CashbackVisibilityIcon({ showGross }: CashbackVisibilityIconProps) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltipBriefly = () => {
    setTooltipOpen(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setTooltipOpen(false), TOOLTIP_AUTOHIDE_MS);
  };

  const label = showGross ? 'Cashback shown' : 'Cashback hidden';

  return (
    <div
      className="relative inline-flex normal-case tracking-normal font-normal"
      onMouseEnter={() => setTooltipOpen(true)}
      onMouseLeave={() => setTooltipOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); showTooltipBriefly(); }}
        className="flex items-center justify-center -m-1 p-1"
        aria-label={label}
      >
        {showGross ? (
          <Eye className="w-3.5 h-3.5 text-success/70" />
        ) : (
          <EyeOff className="w-3.5 h-3.5 text-muted-foreground/40" />
        )}
      </button>

      <div
        className={`absolute bottom-full right-0 mb-1.5 px-2 py-1 bg-background border border-border rounded-lg text-[10px] text-muted-foreground whitespace-nowrap pointer-events-none transition-opacity duration-200 z-50 ${
          tooltipOpen ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {label}
      </div>
    </div>
  );
}
