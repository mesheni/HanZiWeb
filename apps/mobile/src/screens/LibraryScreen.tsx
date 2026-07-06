import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
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

export function LibraryScreen(): React.ReactElement {
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const result = await api.get<Deck[]>('/decks');
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDecks(result.data);
    };
    void load();
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>Колоды</Text>
      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : !decks ? (
        <View style={styles.center}>
          <ActivityIndicator color="#4FC3F7" />
        </View>
      ) : decks.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>Колод пока нет.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {decks.map((d) => (
            <Pressable key={d.id} style={styles.deckCard}>
              <Text style={styles.deckName}>{d.name}</Text>
              {d.description ? (
                <Text style={styles.deckDescription}>{d.description}</Text>
              ) : null}
              <View style={styles.deckMeta}>
                {d.isSystemDeck ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Системная</Text>
                  </View>
                ) : null}
                {d.shareCode ? (
                  <View style={[styles.badge, styles.badgeAccent]}>
                    <Text style={styles.badgeText}>{d.shareCode}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0C0E16',
  },
  title: {
    color: '#E8EAED',
    fontSize: 28,
    fontWeight: '700',
    padding: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    color: '#7B8497',
    fontSize: 15,
  },
  error: {
    color: '#E57373',
    fontSize: 14,
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
});
