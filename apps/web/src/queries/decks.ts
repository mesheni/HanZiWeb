import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client';
import type {
  CreateDeck,
  Deck,
  DeckWithWords,
  ShareDeck,
  SubscribeResult,
  UpdateDeck,
} from '@hanzi/shared';

/** Список всех колод (системные + свои). */
export function useDecks() {
  return useQuery({
    queryKey: ['decks'],
    queryFn: () => apiGet<Deck[]>('/decks'),
  });
}

/** Детали одной колоды со списком wordIds (для конструктора). */
export function useDeck(id: string | null | undefined) {
  return useQuery({
    queryKey: ['decks', id],
    queryFn: () => apiGet<DeckWithWords>(`/decks/${id}`),
    enabled: !!id,
  });
}

/** Создание кастомной колоды. */
export function useCreateDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDeck) => apiPost<Deck>('/decks', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['decks'] });
    },
  });
}

/** Обновление кастомной колоды. */
export function useUpdateDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; body: UpdateDeck }) =>
      apiPut<Deck>(`/decks/${input.id}`, input.body),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['decks'] });
      void qc.invalidateQueries({ queryKey: ['decks', vars.id] });
    },
  });
}

/** Удаление кастомной колоды. */
export function useDeleteDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ deleted: string }>(`/decks/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['decks'] });
    },
  });
}

/** Генерация/получение share-кода для колоды. */
export function useShareDeck() {
  return useMutation({
    mutationFn: (id: string) => apiPost<ShareDeck>(`/decks/${id}/share`),
  });
}

/** Подписка на колоду по share-коду. */
export function useSubscribeByCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      apiPost<SubscribeResult>(`/decks/subscribe-by-code/${encodeURIComponent(code.trim())}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['decks'] });
      void qc.invalidateQueries({ queryKey: ['words'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}
