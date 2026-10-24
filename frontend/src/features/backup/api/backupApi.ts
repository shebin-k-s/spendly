import apiClient from '@/lib/apiClient';

export interface TableSummary {
  table: string;
  rows: number;
}

export interface RestoreResult {
  dryRun: boolean;
  createdAt: string;
  tables: { table: string; backupRows: number; currentRows: number }[];
}

export const backupApi = {
  async summary(): Promise<TableSummary[]> {
    const { data } = await apiClient.get<{ tables: TableSummary[] }>('/backup/summary');
    return data.tables;
  },

  // The whole database as one gzipped file.
  async download(): Promise<Blob> {
    const { data } = await apiClient.get<Blob>('/backup/export', { responseType: 'blob', timeout: 90_000 });
    return data;
  },

  // dryRun: load it inside a transaction and roll back — proves the file will work, changes nothing.
  // A real restore replaces ALL current data and must carry the RESTORE confirmation.
  async restore(file: File, dryRun: boolean): Promise<RestoreResult> {
    const form = new FormData();
    form.append('file', file);
    if (!dryRun) form.append('confirm', 'RESTORE');
    const { data } = await apiClient.post<RestoreResult>(`/backup/restore${dryRun ? '?dryRun=true' : ''}`, form, { timeout: 120_000 });
    return data;
  },
};
