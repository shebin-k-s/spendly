import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Upload, ShieldAlert, Loader2, CheckCircle2, FileArchive } from 'lucide-react';
import { format } from 'date-fns';
import { useBackupSummary, useDownloadBackup, useCheckBackup, useRestoreBackup } from '../hooks/useBackup';
import { useQueryFreshness } from '@/hooks/useQueryFreshness';
import { DataFreshnessIndicator } from '@/components/DataFreshnessIndicator';
import { cn } from '@/lib/utils';

const TABLE_LABEL: Record<string, string> = {
  expenses: 'Expenses',
  categories: 'Categories',
  category_groups: 'Category groups',
  people: 'People',
  debt_transactions: 'Money given / returned',
  merchant_rules: 'Shops',
  missed_dismissals: 'Discarded suggestions',
  missed_cursor: 'Missed-list marker',
  monthly_ai_insights: 'AI summaries',
  webauthn_credential: 'Biometric devices',
};
const label = (table: string) => TABLE_LABEL[table] ?? table;

export default function BackupPage() {
  const navigate = useNavigate();
  const summaryQuery = useBackupSummary();
  const freshness = useQueryFreshness(summaryQuery);
  const download = useDownloadBackup();
  const check = useCheckBackup();
  const restore = useRestoreBackup();

  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const tables = summaryQuery.data ?? [];
  const totalRows = tables.reduce((n, t) => n + t.rows, 0);
  const checked = check.data;
  const busy = download.isPending || check.isPending || restore.isPending;

  const pickFile = (f: File | null) => {
    setFile(f);
    setConfirmText('');
    check.reset();
    restore.reset();
    if (f) check.mutate(f);
  };

  const reset = () => {
    setFile(null);
    setConfirmText('');
    check.reset();
    if (fileInput.current) fileInput.current.value = '';
  };

  const handleRestore = () => {
    if (!file || confirmText !== 'RESTORE') return;
    restore.mutate(file, { onSuccess: reset });
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center active:scale-95 transition-transform">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">Your data</p>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">Backup & restore</h1>
            <DataFreshnessIndicator status={freshness.status} isFetching={freshness.isFetching} />
          </div>
        </div>
      </div>

      <div className="page-content space-y-5">
        {/* Backup */}
        <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileArchive className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold">Back up everything</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Saves the whole database — every table — as one file. Keep it somewhere private: it holds all your expenses and settings.
          </p>

          <div className="rounded-xl bg-secondary/60 divide-y divide-border/60">
            {summaryQuery.isLoading ? (
              <div className="h-24 animate-pulse" />
            ) : tables.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">Couldn't load what's in the database.</p>
            ) : (
              tables.map((t) => (
                <div key={t.table} className="flex items-center justify-between px-3 py-2 text-xs">
                  <span>{label(t.table)}</span>
                  <span className="font-semibold tabular-nums">{t.rows}</span>
                </div>
              ))
            )}
          </div>
          {tables.length > 0 && <p className="text-[11px] text-muted-foreground">{totalRows} rows in {tables.length} tables</p>}

          <button onClick={() => download.mutate()} disabled={busy} className="btn-primary">
            {download.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Preparing backup…</>
            ) : (
              <><Download className="w-4 h-4" /> Download backup</>
            )}
          </button>
        </section>

        {/* Restore */}
        <section className="rounded-2xl border border-destructive/40 bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-destructive" />
            <h2 className="text-sm font-bold">Restore from a backup</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Replaces <span className="font-semibold text-foreground">all current data</span> with the file's. The file is checked first and nothing changes unless it loads completely.
            Download a backup of what you have now before restoring.
          </p>

          <input
            ref={fileInput}
            type="file"
            accept=".gz,.json,application/gzip,application/json"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="w-full py-3 rounded-xl bg-secondary text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <Upload className="w-4 h-4" /> {file ? 'Choose a different file' : 'Choose backup file'}
          </button>

          {file && (
            <p className="text-xs text-muted-foreground break-all">
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </p>
          )}

          {check.isPending && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking the file…
            </p>
          )}

          {checked && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-xl bg-success/15 px-3 py-2">
                <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
                <p className="text-xs">
                  <span className="font-semibold">This backup is valid.</span> Made {format(new Date(checked.createdAt), 'd MMM yyyy, h:mm a')}.
                </p>
              </div>

              <div className="rounded-xl bg-secondary/60 text-xs">
                <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span />
                  <span className="text-right">Backup</span>
                  <span className="text-right">Now</span>
                </div>
                {checked.tables.map((t) => (
                  <div key={t.table} className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-t border-border/60 px-3 py-1.5">
                    <span>{label(t.table)}</span>
                    <span className="text-right font-semibold tabular-nums">{t.backupRows}</span>
                    <span className={cn('text-right tabular-nums', t.backupRows !== t.currentRows && 'text-edited font-semibold')}>{t.currentRows}</span>
                  </div>
                ))}
              </div>

              <div>
                <label className="form-label">
                  Type <span className="font-bold text-destructive">RESTORE</span> to replace all current data
                </label>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  disabled={busy}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="RESTORE"
                  className="form-input"
                />
              </div>

              <button
                onClick={handleRestore}
                disabled={confirmText !== 'RESTORE' || busy}
                className="w-full py-3.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-40"
              >
                {restore.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Restoring…</>
                ) : (
                  'Replace all data with this backup'
                )}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
