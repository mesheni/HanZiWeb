import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { buildSyllablePool, normalizePinyin } from '@hanzi/shared';
import type { MobileWord } from './types';

interface Props {
  word: MobileWord;
  poolPinyin: string[];
  onAnswer: (correct: boolean) => void;
}

/** F22a: конструктор пиньиня — click-to-move слогов (без drag, как в
 * web-версии на тач-устройствах). */
export function SyllableConstructorCard({ word, poolPinyin, onAnswer }: Props): React.ReactElement {
  const correctSyllables = word.pinyin.split(/\s+/).filter(Boolean);
  const [pool, setPool] = useState<string[]>([]);
  const [answer, setAnswer] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBuiltKeyRef = useRef<string>('');

  useEffect(() => {
    const key = `${word.id}::${word.pinyin}`;
    if (lastBuiltKeyRef.current === key) return;
    lastBuiltKeyRef.current = key;
    setPool(buildSyllablePool(word.pinyin, poolPinyin, 3));
    setAnswer([]);
    setSubmitted(false);
    setIsCorrect(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id, word.pinyin]);

  const moveToAnswer = (syllable: string, index: number) => {
    if (submitted) return;
    setAnswer((a) => [...a, syllable]);
    setPool((p) => p.filter((_, i) => i !== index));
  };

  const moveToPool = (syllable: string, index: number) => {
    if (submitted) return;
    setPool((p) => [...p, syllable]);
    setAnswer((a) => a.filter((_, i) => i !== index));
  };

  const submit = () => {
    if (submitted || answer.length === 0) return;
    const ok =
      answer.length === correctSyllables.length &&
      answer.every((s, i) => normalizePinyin(s) === normalizePinyin(correctSyllables[i] ?? ''));
    setIsCorrect(ok);
    setSubmitted(true);
    timerRef.current = setTimeout(() => onAnswer(ok), 700);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cue}>Собери пиньинь</Text>
      <Text style={styles.character}>{word.character}</Text>
      <Text style={styles.hint}>{word.translation}</Text>

      <View
        style={[styles.answerZone, submitted && (isCorrect ? styles.answerOk : styles.answerBad)]}
      >
        {answer.length === 0 ? (
          <Text style={styles.placeholder}>Нажимай на слоги снизу</Text>
        ) : (
          <View style={styles.chips}>
            {answer.map((s, i) => (
              <Pressable key={`a-${i}-${s}`} style={styles.chip} onPress={() => moveToPool(s, i)}>
                <Text style={styles.chipText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <ScrollView style={styles.poolZone} contentContainerStyle={styles.chips}>
        {pool.map((s, i) => (
          <Pressable key={`p-${i}-${s}`} style={styles.chip} onPress={() => moveToAnswer(s, i)}>
            <Text style={styles.chipText}>{s}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Pressable
        style={[styles.submit, (submitted || answer.length === 0) && styles.submitDisabled]}
        onPress={submit}
        disabled={submitted || answer.length === 0}
      >
        <Text style={styles.submitText}>Проверить</Text>
      </Pressable>

      {submitted && (
        <Text style={[styles.feedback, isCorrect ? styles.feedbackOk : styles.feedbackBad]}>
          {isCorrect ? `Верно: ${word.pinyin}` : `Правильно: ${word.pinyin}`}
        </Text>
      )}
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
  character: {
    color: '#E8EAED',
    fontSize: 48,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 8,
  },
  hint: {
    color: '#7B8497',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  answerZone: {
    minHeight: 64,
    borderRadius: 12,
    backgroundColor: '#141820',
    padding: 10,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  answerOk: {
    borderColor: '#81C784',
  },
  answerBad: {
    borderColor: '#E57373',
  },
  placeholder: {
    color: '#4A5161',
    fontSize: 14,
    textAlign: 'center',
  },
  poolZone: {
    maxHeight: 120,
    marginTop: 10,
    backgroundColor: '#141820',
    borderRadius: 12,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 10,
  },
  chip: {
    backgroundColor: '#1E2330',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  chipText: {
    color: '#E8EAED',
    fontSize: 16,
  },
  submit: {
    backgroundColor: '#4FC3F7',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: '#0C0E16',
    fontSize: 16,
    fontWeight: '700',
  },
  feedback: {
    textAlign: 'center',
    marginTop: 12,
    fontSize: 15,
  },
  feedbackOk: {
    color: '#81C784',
  },
  feedbackBad: {
    color: '#E57373',
  },
});
