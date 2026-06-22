import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { peopleApi } from '../api/peopleApi';
import { toast } from 'sonner';

export const usePeople = () => {
  return useQuery({
    queryKey: ['people'],
    queryFn: peopleApi.getAll,
  });
};

export const usePerson = (id: string, enabled = true) => {
  return useQuery({
    queryKey: ['people', id],
    queryFn: () => peopleApi.getById(id),
    enabled: !!id && enabled,
  });
};

export const useCreatePerson = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: peopleApi.createPerson,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'], refetchType: 'all' });
      toast.success('Person added successfully');
    },
    onError: () => {
      toast.error('Failed to add person');
    },
  });
};

export const useUpdatePerson = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => 
      peopleApi.updatePerson(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'], refetchType: 'all' });
      toast.success('Person updated successfully');
    },
  });
};

export const useDeletePerson = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: peopleApi.deletePerson,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'], refetchType: 'all' });
      toast.success('Person deleted successfully');
    },
  });
};

export const useAddDebtTransaction = (personId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: any) => peopleApi.addTransaction(personId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'], refetchType: 'all' });
      toast.success('Transaction added successfully');
    },
    onError: () => {
      toast.error('Failed to add transaction');
    },
  });
};

export const useDeleteDebtTransaction = (personId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: peopleApi.deleteTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'], refetchType: 'all' });
      toast.success('Transaction deleted');
    },
  });
};
