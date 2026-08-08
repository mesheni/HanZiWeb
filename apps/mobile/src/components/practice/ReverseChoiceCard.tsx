import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { buildReverseChoiceOptions } from '@hanzi/shared';
import type { MobileWord } from './types';

interface Props {
  word: MobileWord;
  pool: MobileWord[];
  onAnswer: (correct: boolean) => void;
}

type OptionState = 'idle' | 'correct' | 'wrong' | 'revealed';

/** F22a: reverse-choice — русский перевод, выбор правильного иероглифа. */
export function ReverseChoiceCard({ word, pool, onAnswer }: Props): React.ReactElement {
  const options = useMemo(() => buildReverseChoiceOptions(word, pool, 4), [word, pool]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, OptionState>>({});

  useEffect(() => {
    setSelectedId(null);
    setStates({});
  }, [word.id]);

  const choose = (option: MobileWord) => {
    if (selectedId) return;
    const isCorrect = option.id === word.id;
    setSelectedId(option.id);
    setStates({
      [option.id]: isCorrect ? 'correct' : 'wrong',
      [word.id]: isCorrect ? 'correct' : 'revealed',
    });
    onAnswer(isCorrect);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cue}>Выбери иероглиф</Text>
      <Text style={styles.translation}>{word.translation}</Text>
      <View style={styles.options}>
        {options.map((option) => {
          const state = states[option.id] ?? 'idle';
          return (
            <Pressable
              key={option.id}
              style={[
                styles.option,
                state === 'correct' && styles.optionCorrect,
                state === 'wrong' && styles.optionWrong,
                state === 'revealed' && styles.optionRevealed,
              ]}
              onPress={() => choose(option)}
              disabled={!!selectedId}
            >
              <Text style={styles.optionCharacter}>{option.character}</Text>
              {state === 'correct' && <Text style={styles.markCorrect}>✓</Text>}
              {state === 'wrong' && <Text style={styles.markWrong}>✗</Text>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    justifyContent: 'center',
    padding: 8,
  },
  cue: {
    color: '#7B8497',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  translation: {
    color: '#E8EAED',
    fontSize: 26,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 28,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  option: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: '#1E2330',
    borderRadius: 12,
    paddingVertical: 22,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  optionCorrect: {
    backgroundColor: 'rgba(129,199,132,0.18)',
    borderWidth: 1,
    borderColor: '#81C784',
  },
  optionWrong: {
    backgroundColor: 'rgba(229,115,115,0.15)',
    borderWidth: 1,
    borderColor: '#E57373',
  },
  optionRevealed: {
    borderWidth: 1,
    borderColor: '#81C784',
  },
  optionCharacter: {
    color: '#E8EAED',
    fontSize: 30,
    fontWeight: '500',
  },
  markCorrect: {
    color: '#81C784',
    fontSize: 16,
    fontWeight: '700',
  },
  markWrong: {
    color: '#E57373',
    fontSize: 16,
    fontWeight: '700',
  },
});
