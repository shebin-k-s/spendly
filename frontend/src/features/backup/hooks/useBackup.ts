import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { backupApi } from '../api/backupApi';
import { getErrorMessage } from '@/utils/getErrorMessage';

const BACKUP_KEY = ['backup'] as const;

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
    onError: (error) => toast.error(getErrorMessage(error)),
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
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
