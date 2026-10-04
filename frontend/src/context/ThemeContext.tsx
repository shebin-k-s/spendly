import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'spendly_theme';
const MANIFEST_THEME_COLOR = '#0a0a0a'; // keep in sync with theme_color in vite.config.ts

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialTheme(): Theme {
  return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
}

// "0 0% 100%" (a shadcn-style HSL CSS variable) → "#ffffff".
function hslVarToHex(value: string): string {
  const [h, s, l] = value.replace(/%/g, '').split(/\s+/).map(Number);
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(STORAGE_KEY, theme);

    // In a browser tab, match the address bar to the real page color (read
    // from --background rather than hardcoded). The installed app is different:
    // Android paints its status bar from the manifest's fixed dark color and
    // only uses theme-color to pick light vs dark status icons — so a light
    // theme-color there gives dark icons on a black bar (unreadable). Keep it
    // dark in standalone so the icons stay white in both themes.
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', standalone ? MANIFEST_THEME_COLOR : hslVarToHex(bg));
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
