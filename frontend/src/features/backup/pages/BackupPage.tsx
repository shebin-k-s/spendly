import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Download, Upload, ShieldAlert, Loader2, CheckCircle2, FileArchive, Cloud, ExternalLink, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import type { DriveStatus } from '../api/backupApi';
import { useBackupSummary, useDownloadBackup, useCheckBackup, useRestoreBackup, useDriveStatus, useConnectDrive, useRunDriveBackup, useSetDriveAuto, useDisconnectDrive } from '../hooks/useBackup';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { useQueryFreshness } from '@/hooks/useQueryFreshness';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import { DataFreshnessIndicator } from '@/components/DataFreshnessIndicator';
import { cn } from '@/lib/utils';
import { readFileBytes } from '@/utils/readFile';

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

// `connecting`: we have just come back from Google and are waiting for the first fresh answer — the one moment
// the card shows a loading block. Every refresh after that keeps the card as it is; only the page's dot moves.
function DriveSection({ status, connecting }: { status: UseQueryResult<DriveStatus>; connecting: boolean }) {
  const connect = useConnectDrive();
  const run = useRunDriveBackup();
  const setAuto = useSetDriveAuto();
  const disconnect = useDisconnectDrive();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const d = status.data;
  const busy = connect.isPending || run.isPending || setAuto.isPending || disconnect.isPending;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Cloud className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold">Google Drive</h2>
      </div>

      {connecting ? (
        <div className="h-40 rounded-xl bg-secondary/60 animate-pulse" />
      ) : !d ? (
        status.isError ? <p className="text-xs text-muted-foreground">Couldn't load the Google Drive status.</p> : null
      ) : !d.configured ? (
        <p className="text-xs text-muted-foreground">
          Google Drive backup isn't set up on the server yet. It needs the Google sign-in keys added to the server settings.
        </p>
      ) : !d.connected ? (
        <>
          <p className="text-xs text-muted-foreground">
            Backups go to a <span className="font-semibold text-foreground">Spendly Backups</span> folder in your Drive.
          </p>
          <button onClick={() => connect.mutate()} disabled={busy} className="btn-primary">
            {connect.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening Google…</> : <><Cloud className="w-4 h-4" /> Connect Google Drive</>}
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="min-w-0 truncate">
              Connected{d.accountEmail ? <> as <span className="font-semibold">{d.accountEmail}</span></> : null}
            </span>
            {d.folderUrl && (
              <a href={d.folderUrl} target="_blank" rel="noreferrer" className="shrink-0 flex items-center gap-1 font-semibold text-primary">
                Open folder <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {d.lastStatus && (
            <div className={cn('flex items-start gap-2 rounded-xl px-3 py-2 text-xs', d.lastStatus === 'ok' ? 'bg-success/15' : 'bg-destructive/10')}>
              {d.lastStatus === 'ok' ? <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />}
              <p className="min-w-0 break-words">
                {d.lastStatus === 'ok' ? 'Last backup' : 'Last backup failed'}
                {d.lastRunAt ? ` · ${format(new Date(d.lastRunAt), 'd MMM, h:mm a')}` : ''}
                {d.lastStatus === 'error' && d.lastMessage ? <span className="block text-muted-foreground mt-0.5">{d.lastMessage}</span> : null}
              </p>
            </div>
          )}

          <button onClick={() => run.mutate()} disabled={busy} className="btn-primary">
            {run.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Backing up…</> : <><Cloud className="w-4 h-4" /> Back up to Drive now</>}
          </button>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-xs font-semibold">Back up automatically every day</p>
              <p className="text-[11px] text-muted-foreground">
                {d.schedulerKeySet ? `Keeps the newest ${d.keep} backups.` : 'The server needs its daily-backup key and the scheduled job first.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={d.autoEnabled}
              onClick={() => setAuto.mutate(!d.autoEnabled)}
              disabled={busy || (!d.autoEnabled && !d.schedulerKeySet)}
              className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', d.autoEnabled ? 'bg-primary' : 'bg-border')}
            >
              <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', d.autoEnabled ? 'left-[22px]' : 'left-0.5')} />
            </button>
          </div>

          <button type="button" onClick={() => setConfirmDisconnect(true)} disabled={busy} className="text-xs font-semibold text-destructive disabled:opacity-50">
            Disconnect
          </button>
          <ConfirmModal
            open={confirmDisconnect}
            onOpenChange={setConfirmDisconnect}
            title="Disconnect Google Drive?"
            description="Automatic backups stop. Backups already in your Drive stay there."
            confirmText="Disconnect"
            isLoading={disconnect.isPending}
            onConfirm={() => disconnect.mutate()}
          />
        </>
      )}
    </section>
  );
}

export default function BackupPage() {
  const navigate = useNavigate();
  const summaryQuery = useBackupSummary();
  const driveQuery = useDriveStatus();
  useRefetchOnFocus(driveQuery);
  const summaryFreshness = useQueryFreshness(summaryQuery);
  const driveFreshness = useQueryFreshness(driveQuery);
  // One dot for the whole page: refreshing if either part is, red if either failed to refresh.
  const freshness = {
    isFetching: summaryFreshness.isFetching || driveFreshness.isFetching,
    status: summaryFreshness.status === 'error' || driveFreshness.status === 'error' ? ('error' as const) : summaryFreshness.status === 'loading' || driveFreshness.status === 'loading' ? ('loading' as const) : ('fresh' as const),
  };
  const download = useDownloadBackup();
  const check = useCheckBackup();
  const restore = useRestoreBackup();

  // Google sends the browser back here with ?drive=connected or ?drive=error&message=…
  const [params] = useSearchParams();
  const qc = useQueryClient();
  // Did we just come back from Google? Then the saved status is out of date: wait for one fresh answer.
  const [returning] = useState(() => !!params.get('drive'));
  const openedAt = useRef(Date.now());
  const connecting = returning && driveQuery.dataUpdatedAt < openedAt.current && !driveQuery.isError;
  useEffect(() => {
    const result = params.get('drive');
    if (!result) return;
    qc.invalidateQueries({ queryKey: ['backup'] });
    if (result === 'connected') toast.success('Google Drive connected');
    else toast.error(params.get('message') || 'Could not connect Google Drive');
    // The browser's Back would otherwise walk back through Google's sign-in pages. Rewrite the top of the
    // history to "Dashboard, then Backup" (this also clears ?drive=… from the address), so Back goes to the app.
    navigate('/', { replace: true });
    navigate('/backup');
  }, [params, navigate, qc]);

  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const tables = summaryQuery.data ?? [];
  const totalRows = tables.reduce((n, t) => n + t.rows, 0);
  const checked = check.data;
  const busy = download.isPending || check.isPending || restore.isPending;

  const pickFile = async (picked: File | null) => {
    setConfirmText('');
    check.reset();
    restore.reset();
    if (!picked) {
      setFile(null);
      return;
    }
    try {
      // A file picked from Google Drive (or another cloud app) is only a link until it is read, and reading
      // it later — when the upload starts — often fails as a "Network Error". Read it now, while it is
      // available, and upload this in-memory copy instead.
      const copy = new File([await readFileBytes(picked)], picked.name, { type: picked.type });
      setFile(copy);
      check.mutate(copy);
    } catch {
      setFile(null);
      toast.error("Couldn't read that file. Download it to your phone first, then choose it from Downloads.");
    }
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
        <DriveSection status={driveQuery} connecting={connecting} />

        {/* Backup */}
        <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileArchive className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold">Download a copy</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Saves everything as one file — keep it somewhere private.
            {tables.length > 0 && <span className="text-foreground font-semibold"> {totalRows} rows in {tables.length} tables.</span>}
          </p>

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
            Replaces <span className="font-semibold text-foreground">all current data</span> with the file's. It's checked first, and nothing changes unless it loads fully.
          </p>

          <input
            ref={fileInput}
            type="file"
            accept=".gz,.json,application/gzip,application/json"
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0] ?? null;
              void pickFile(picked).finally(() => { e.target.value = ''; }); // so choosing the same file again still triggers
            }}
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
                {checked.tables.filter((t) => t.backupRows > 0 || t.currentRows > 0).map((t) => (
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
