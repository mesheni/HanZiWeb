import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../bootstrap';

interface Deck {
  id: string;
  name: string;
  description: string | null;
  isSystemDeck: boolean;
  ownerId: string | null;
  shareCode: string | null;
}

/** F22b: read-only → create/join. */
export function LibraryScreen(): React.ReactElement {
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Поля формы создания.
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  // Поле формы join.
  const [joinCode, setJoinCode] = useState('');

  const load = useCallback(async () => {
    const result = await api.get<Deck[]>('/decks');
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDecks(result.data);
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createDeck = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    const result = await api.post<Deck>('/decks', {
      name,
      ...(newDescription.trim() ? { description: newDescription.trim() } : {}),
    });
    setSaving(false);
    if (!result.ok) {
      Alert.alert('Ошибка', result.message);
      return;
    }
    setCreateOpen(false);
    setNewName('');
    setNewDescription('');
    void load();
  };

  const joinByCode = async () => {
    const code = joinCode.trim();
    if (!code) return;
    setSaving(true);
    const result = await api.post<Deck>(`/decks/subscribe-by-code/${code}`);
    setSaving(false);
    if (!result.ok) {
      Alert.alert('Ошибка', result.message);
      return;
    }
    setJoinOpen(false);
    setJoinCode('');
    void load();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Колоды</Text>
        <View style={styles.actions}>
          <Pressable style={styles.actionButton} onPress={() => setJoinOpen(true)}>
            <Text style={styles.actionText}>Код</Text>
          </Pressable>
          <Pressable
            style={[styles.actionButton, styles.actionPrimary]}
            onPress={() => setCreateOpen(true)}
          >
            <Text style={styles.actionPrimaryText}>Создать</Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retry} onPress={() => void load()}>
            <Text style={styles.retryText}>Повторить</Text>
          </Pressable>
        </View>
      ) : !decks ? (
        <View style={styles.center}>
          <ActivityIndicator color="#4FC3F7" />
        </View>
      ) : decks.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>
            Колод пока нет. Создайте свою или присоединитесь по коду.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {decks.map((d) => (
            <Pressable key={d.id} style={styles.deckCard}>
              <Text style={styles.deckName}>{d.name}</Text>
              {d.description ? <Text style={styles.deckDescription}>{d.description}</Text> : null}
              <View style={styles.deckMeta}>
                {d.isSystemDeck ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Системная</Text>
                  </View>
                ) : null}
                {d.shareCode ? (
                  <View style={[styles.badge, styles.badgeAccent]}>
                    <Text style={styles.badgeAccentText}>{d.shareCode}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* F22b: создание колоды */}
      <Modal
        visible={createOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Новая колода</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="Название"
              placeholderTextColor="#4A5161"
              autoFocus
            />
            <TextInput
              style={styles.input}
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="Описание (необязательно)"
              placeholderTextColor="#4A5161"
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setCreateOpen(false)}>
                <Text style={styles.modalCancelText}>Отмена</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSubmit, (!newName.trim() || saving) && styles.disabled]}
                onPress={() => void createDeck()}
                disabled={!newName.trim() || saving}
              >
                <Text style={styles.modalSubmitText}>{saving ? 'Создаём…' : 'Создать'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* F22b: join по share-коду */}
      <Modal
        visible={joinOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setJoinOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Присоединиться по коду</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={joinCode}
              onChangeText={setJoinCode}
              placeholder="Например: HANZI-ABCD"
              placeholderTextColor="#4A5161"
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setJoinOpen(false)}>
                <Text style={styles.modalCancelText}>Отмена</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSubmit, (!joinCode.trim() || saving) && styles.disabled]}
                onPress={() => void joinByCode()}
                disabled={!joinCode.trim() || saving}
              >
                <Text style={styles.modalSubmitText}>
                  {saving ? 'Подключаем…' : 'Присоединиться'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0C0E16',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  title: {
    color: '#E8EAED',
    fontSize: 28,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    backgroundColor: '#1E2330',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionPrimary: {
    backgroundColor: '#4FC3F7',
  },
  actionText: {
    color: '#4FC3F7',
    fontSize: 14,
    fontWeight: '600',
  },
  actionPrimaryText: {
    color: '#0C0E16',
    fontSize: 14,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  empty: {
    color: '#7B8497',
    fontSize: 15,
    textAlign: 'center',
  },
  error: {
    color: '#E57373',
    fontSize: 14,
    marginBottom: 12,
  },
  retry: {
    backgroundColor: '#1E2330',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryText: {
    color: '#4FC3F7',
    fontSize: 14,
    fontWeight: '500',
  },
  list: {
    padding: 16,
    paddingTop: 0,
  },
  deckCard: {
    backgroundColor: '#141820',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  deckName: {
    color: '#E8EAED',
    fontSize: 17,
    fontWeight: '600',
  },
  deckDescription: {
    color: '#7B8497',
    fontSize: 14,
    marginTop: 4,
  },
  deckMeta: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  badge: {
    backgroundColor: '#1E2330',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeAccent: {
    backgroundColor: '#4FC3F7',
  },
  badgeText: {
    color: '#E8EAED',
    fontSize: 12,
    fontWeight: '500',
  },
  badgeAccentText: {
    color: '#0C0E16',
    fontSize: 12,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#141820',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    color: '#E8EAED',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#1E2330',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#E8EAED',
    fontSize: 15,
    marginBottom: 12,
  },
  codeInput: {
    textTransform: 'uppercase',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  modalCancel: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalCancelText: {
    color: '#7B8497',
    fontSize: 15,
  },
  modalSubmit: {
    backgroundColor: '#4FC3F7',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  modalSubmitText: {
    color: '#0C0E16',
    fontSize: 15,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.5,
  },
});
