import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '@/lib/apiClient';
import { getErrorMessage } from '@/utils/getErrorMessage';

export default function UnlockPage() {
  const navigate = useNavigate();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;

    setError('');
    setLoading(true);

    try {
      const { data } = await apiClient.post('/auth/unlock', { key: key.trim() });
      localStorage.setItem('accessToken', data.accessToken);
      navigate('/', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    // Outer: full-screen on mobile, muted bg + centered on desktop
    <div className="min-h-dvh bg-background overflow-y-auto flex flex-col sm:bg-muted/30 sm:items-center sm:justify-center sm:p-6">

      {/* Card: full-height flex column on mobile, fixed-width rounded card on desktop */}
      <div className="w-full flex-1 flex flex-col sm:flex-none sm:w-full sm:max-w-sm sm:rounded-3xl sm:overflow-hidden sm:border sm:border-border sm:shadow-xl sm:bg-card">

        {/* Brand section — flex-1 on mobile so it fills space above form */}
        <div className="flex flex-col items-center justify-center flex-1 min-h-[260px] sm:flex-none sm:min-h-0 px-6 py-10 sm:py-12 sm:bg-primary/[0.06]">
          <div className="w-20 h-20 rounded-[22px] overflow-hidden shadow-md mb-5">
            <img src="/logo.png" alt="Spendly" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Spendly</h1>
          <p className="text-sm text-muted-foreground mt-2">Track every rupee, every day</p>
        </div>

        <div className="hidden sm:block h-px bg-border" />

        {/* Form section — anchored to bottom on mobile, padded block on desktop */}
        <div className="px-6 pb-10 pt-2 sm:px-7 sm:py-7 sm:bg-card">
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-xs text-center text-muted-foreground mb-1">
              Enter your access key to continue
            </p>
            <input
              type="password"
              inputMode="numeric"
              value={key}
              onChange={(e) => { setKey(e.target.value); setError(''); }}
              placeholder="••••••"
              autoFocus
              autoComplete="current-password"
              onFocus={(e) =>
                setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)
              }
              className="form-input text-center text-2xl tracking-[0.35em] h-14"
            />

            {error && (
              <p className="text-xs text-destructive text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={!key.trim() || loading}
              className="btn-primary h-12"
            >
              {loading ? 'Unlocking…' : 'Unlock'}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
