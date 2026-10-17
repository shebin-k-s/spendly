import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Settings, Check, LogOut } from 'lucide-react';
import { useTheme, THEMES, type Theme } from '@/context/ThemeContext';
import apiClient, { notifySwLogout } from '@/lib/apiClient';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

const THEME_LABEL: Record<Theme, string> = { dark: 'Dark', dim: 'Dim', light: 'Light', dawn: 'Dawn' };
// Page color with the accent as a half-circle, so each option previews its palette.
const THEME_SWATCH: Record<Theme, string> = {
  dark: 'linear-gradient(135deg, #0a0a0a 50%, #8b6cf0 50%)',
  dim: 'linear-gradient(135deg, #232634 50%, #ca9ee6 50%)',
  light: 'linear-gradient(135deg, #e6e9ef 50%, #7a2fd6 50%)',
  dawn: 'linear-gradient(135deg, #f2e9e1 50%, #6b5590 50%)',
};

/**
 * Single overflow menu for header actions that don't need to be one-tap —
 * theme + logout used to be two separate always-visible icon buttons, which
 * crowded the header next to the month navigator. Folding them behind one
 * trigger keeps the header to two elements again.
 */
export default function HeaderMenu() {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Even offline, still clear local state below — staying "logged in"
      // on this device with a session the server already forgot helps no one.
    } finally {
      localStorage.removeItem('accessToken');
      notifySwLogout();
      setLoggingOut(false);
      navigate('/unlock', { replace: true });
    }
  };

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            aria-label="Menu"
            className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center active:opacity-60 transition-opacity"
          >
            <Settings className="w-4 h-4" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={8}
            className="z-50 min-w-[180px] rounded-2xl border border-border bg-card shadow-xl p-1.5 animate-in fade-in zoom-in-95 duration-150"
          >
            <DropdownMenu.Label className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Theme
            </DropdownMenu.Label>
            {THEMES.map((t) => (
              <DropdownMenu.Item
                key={t}
                onSelect={() => setTheme(t)}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm outline-none cursor-pointer data-[highlighted]:bg-muted"
              >
                <span
                  aria-hidden
                  className="w-4 h-4 rounded-full border border-border shrink-0"
                  style={{ background: THEME_SWATCH[t] }}
                />
                <span className="flex-1">{THEME_LABEL[t]}</span>
                {theme === t && <Check className="w-4 h-4 text-primary" />}
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Separator className="h-px bg-border my-1" />
            <DropdownMenu.Item
              onSelect={() => setConfirmOpen(true)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-destructive outline-none cursor-pointer data-[highlighted]:bg-destructive/10"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Log out?"
        description="You'll need your access key (or fingerprint, if set up) to get back in."
        confirmText="Log out"
        isLoading={loggingOut}
        onConfirm={handleLogout}
      />
    </>
  );
}
