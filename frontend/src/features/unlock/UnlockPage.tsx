import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs">
        {/* Logo area */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center mb-4">
            <Lock className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Spendly</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter your access key to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            inputMode="numeric"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Access key"
            autoFocus
            className="form-input text-center text-lg tracking-widest"
          />

          {error && (
            <p className="text-xs text-destructive text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={!key.trim() || loading}
            className="btn-primary"
          >
            {loading ? 'Unlocking...' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  );
}
