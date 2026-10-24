import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { backupApi, type DriveStatus } from '../api/backupApi';
import axios from 'axios';
import { getErrorMessage } from '@/utils/getErrorMessage';

const BACKUP_KEY = ['backup'] as const;

// "Network Error" tells nobody anything: say what it usually means here.
function restoreErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && !error.response) {
    return "Couldn't reach the server — it may be waking up. Wait a moment and try again.";
  }
  return getErrorMessage(error);
}

export function useBackupSummary() {
  return useQuery({
    queryKey: [...BACKUP_KEY, 'summary'],
    queryFn: backupApi.summary,
    staleTime: 30_000,
  });
}

// Fetches the backup and hands it to the browser as a file download.
export function useDownloadBackup() {
  return useMutation({
    mutationFn: async () => {
      const blob = await backupApi.download();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spendly-backup-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json.gz`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    onSuccess: () => toast.success('Backup downloaded'),
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

// Dry run: checks that a backup file will load, without changing anything.
export function useCheckBackup() {
  return useMutation({
    mutationFn: (file: File) => backupApi.restore(file, true),
    onError: (error) => toast.error(restoreErrorMessage(error)),
  });
}

export function useRestoreBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => backupApi.restore(file, false),
    onSuccess: () => {
      // Every screen's data may have changed.
      qc.invalidateQueries();
      toast.success('Backup restored — all data replaced');
    },
    onError: (error) => toast.error(restoreErrorMessage(error)),
  });
}

// Always re-checked when the page opens: this status changes outside the app (the Google
// sign-in happens on another site), so a saved copy of "not connected" must never be shown as current.
export function useDriveStatus() {
  return useQuery({
    queryKey: [...BACKUP_KEY, 'drive'],
    queryFn: backupApi.driveStatus,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

// Sends the browser to Google to approve access; Google then returns to the Backup page.
export function useConnectDrive() {
  return useMutation({
    mutationFn: async () => {
      // replace, not assign: the Backup page is swapped for Google's page instead of being kept in the
      // history behind it, so Back after returning can't land on an old copy of this page.
      window.location.replace(await backupApi.driveConnectUrl());
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useRunDriveBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: backupApi.driveRun,
    onSuccess: (r) => toast.success(`Backed up to Google Drive (${r.fileName})`),
    onError: (error) => toast.error(getErrorMessage(error)),
    // Success or failure, the "last backup" line changed.
    onSettled: () => qc.invalidateQueries({ queryKey: [...BACKUP_KEY, 'drive'] }),
  });
}

export function useSetDriveAuto() {
  const qc = useQueryClient();
  const key = [...BACKUP_KEY, 'drive'];
  return useMutation({
    mutationFn: (enabled: boolean) => backupApi.driveSetAuto(enabled),
    // Flip the switch on screen at once; put it back if the server says no.
    onMutate: async (enabled) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<DriveStatus>(key);
      qc.setQueryData<DriveStatus>(key, (old) => (old ? { ...old, autoEnabled: enabled } : old));
      return { previous };
    },
    onError: (error, _enabled, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
      toast.error(getErrorMessage(error));
    },
    onSuccess: (status) => {
      qc.setQueryData(key, status);
      toast.success(status.autoEnabled ? 'Automatic daily backup is on' : 'Automatic backup is off');
    },
  });
}

export function useDisconnectDrive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: backupApi.driveDisconnect,
    onSuccess: (status) => {
      qc.setQueryData([...BACKUP_KEY, 'drive'], status);
      toast.success('Google Drive disconnected');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
