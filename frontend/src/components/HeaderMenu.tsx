import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Settings, Sun, Moon, LogOut } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import apiClient, { notifySwLogout } from '@/lib/apiClient';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

/**
 * Single overflow menu for header actions that don't need to be one-tap —
 * theme + logout used to be two separate always-visible icon buttons, which
 * crowded the header next to the month navigator. Folding them behind one
 * trigger keeps the header to two elements again.
 */
export default function HeaderMenu() {
  const { theme, toggleTheme } = useTheme();
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
            <DropdownMenu.Item
              onSelect={toggleTheme}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm outline-none cursor-pointer data-[highlighted]:bg-muted"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </DropdownMenu.Item>
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
