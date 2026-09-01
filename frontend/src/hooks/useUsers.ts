import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTransport } from '../services/transport';
import type { ApiUser } from '../services/transport/types';

export type ManagedUser = ApiUser;

/**
 * The user list backing UserManagementSheet (T-52 / SEC-09, admin-only).
 * `enabled` lets the sheet skip the request entirely for a non-admin
 * session instead of firing a request that the backend will 403 anyway.
 */
export const useUsers = (enabled: boolean) => {
  const transport = getTransport();
  return useQuery<ManagedUser[]>({
    queryKey: ['users'],
    queryFn: () => transport.users.list(),
    enabled,
  });
};

export const useCreateUser = () => {
  const transport = getTransport();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { username: string; password: string; role: string }) => transport.users.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
};

export const useUpdateUser = () => {
  const transport = getTransport();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { role?: string; password?: string } }) =>
      transport.users.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
};

export const useDeleteUser = () => {
  const transport = getTransport();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => transport.users.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
};
