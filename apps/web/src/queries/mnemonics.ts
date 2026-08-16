import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPut } from '../api/client';
import { getSyncEngine } from '../db/sync';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import type { MnemonicBatchResponse, UserMnemonic } from '@hanzi/shared';

/**
 * Личная мнемоника одного слова. Загружается по требованию (оборот
 * флеш-карты, карточка слова). refetchOnWindowFocus (дефолт React
 * Query) подтягивает правки с других устройств — sync-дельты для
 * мнемоник в v1 нет (упрощение, см. план).
 */
export function useMnemonic(wordId: string | null | undefined) {
  return useQuery<UserMnemonic | null>({
    queryKey: ['mnemonics', wordId],
    queryFn: async () => {
      const data = await apiGet<MnemonicBatchResponse>(
        `/users/me/mnemonics?wordIds=${encodeURIComponent(wordId!)}`,
      );
      return data.items[0] ?? null;
    },
    enabled: typeof wordId === 'string' && wordId.length > 0,
    staleTime: 60_000,
  });
}

export interface SaveMnemonicInput {
  wordId: string;
  text: string;
}

export function useSaveMnemonic() {
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();

  return useMutation<UserMnemonic, Error, SaveMnemonicInput>({
    mutationFn: async ({ wordId, text }) => {
      if (isOnline) {
        return apiPut<UserMnemonic>(`/users/me/mnemonics/${wordId}`, { text });
      }
      // Офлайн: та же LWW-логика на сервере через sync-очередь.
      const sync = getSyncEngine();
      if (!sync) throw new Error('Офлайн-сохранение недоступно');
      const updatedAt = new Date().toISOString();
      await sync.enqueueChange('mnemonic_upsert', { wordId, text, updatedAt });
      return { wordId, text, updatedAt };
    },
    onSuccess: (mnemonic) => {
      queryClient.setQueryData(['mnemonics', mnemonic.wordId], mnemonic);
    },
  });
}

export function useDeleteMnemonic() {
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();

  return useMutation<void, Error, string>({
    mutationFn: async (wordId) => {
      if (isOnline) {
        await apiDelete(`/users/me/mnemonics/${wordId}`);
        return;
      }
      const sync = getSyncEngine();
      if (!sync) throw new Error('Офлайн-удаление недоступно');
      await sync.enqueueChange('mnemonic_delete', {
        wordId,
        updatedAt: new Date().toISOString(),
      });
    },
    onSuccess: (_void, wordId) => {
      queryClient.setQueryData(['mnemonics', wordId], null);
    },
  });
}
