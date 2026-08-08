import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { pinyinSyllableMatches } from '@hanzi/shared';
import type { MobileWord } from './types';

interface Props {
  word: MobileWord;
  onAnswer: (correct: boolean) => void;
}

/** F22a: ввод пиньиня — иероглиф, пользователь набирает пиньинь (тоны
 * цифрами 1-4 или диакритикой). Проверка послоговая. */
export function PinyinInputCard({ word, onAnswer }: Props): React.ReactElement {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [allOk, setAllOk] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setInput('');
    setSubmitted(false);
    setAllOk(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [word.id]);

  const submit = () => {
    if (submitted || !input.trim()) return;
    const matches = pinyinSyllableMatches(input, word.pinyin);
    const ok = matches.every(Boolean);
    setAllOk(ok);
    setSubmitted(true);
    timerRef.current = setTimeout(() => onAnswer(ok), 700);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cue}>Набери пиньинь</Text>
      <Text style={styles.character}>{word.character}</Text>
      <Text style={styles.hint}>{word.translation}</Text>

      <TextInput
        style={[styles.input, submitted && (allOk ? styles.inputCorrect : styles.inputWrong)]}
        value={input}
        onChangeText={setInput}
        placeholder="например, xǐ huān или xi3 huan1"
        placeholderTextColor="#4A5161"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!submitted}
        onSubmitEditing={submit}
        returnKeyType="done"
      />
      <Pressable
        style={[styles.submit, (!input.trim() || submitted) && styles.submitDisabled]}
        onPress={submit}
        disabled={submitted || !input.trim()}
      >
        <Text style={styles.submitText}>Проверить</Text>
      </Pressable>

      {submitted && (
        <Text style={[styles.feedback, allOk ? styles.feedbackOk : styles.feedbackBad]}>
          {allOk ? `Верно: ${word.pinyin}` : `Правильно: ${word.pinyin}`}
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
    fontSize: 64,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 10,
  },
  hint: {
    color: '#7B8497',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#1E2330',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: '#E8EAED',
    fontSize: 18,
  },
  inputCorrect: {
    borderWidth: 1,
    borderColor: '#81C784',
  },
  inputWrong: {
    borderWidth: 1,
    borderColor: '#E57373',
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
    marginTop: 14,
    fontSize: 15,
  },
  feedbackOk: {
    color: '#81C784',
  },
  feedbackBad: {
    color: '#E57373',
  },
});
