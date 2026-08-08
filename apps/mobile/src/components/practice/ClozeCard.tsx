import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { buildClozeQuestion, checkClozeAnswer, CLOZE_MARKER } from '@hanzi/shared';
import type { Example, ClozeQuestion } from '@hanzi/shared';
import { api } from '../../bootstrap';
import type { MobileWord } from './types';

interface Props {
  word: MobileWord;
  examples: Example[];
  onAnswer: (correct: boolean) => void;
}

/** F22a: cloze — предложение с пропуском, ввод скрытого слова. Попытка
 * пишется в /cloze/attempts best-effort (как в web-версии). */
export function ClozeCard({ word, examples, onAnswer }: Props): React.ReactElement {
  const question = useMemo<ClozeQuestion | null>(() => {
    for (const ex of examples) {
      const q = buildClozeQuestion(ex, word);
      if (q) return q;
    }
    return null;
  }, [examples, word.id, word.character, word.pinyin]);

  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setInput('');
    setSubmitted(false);
    setIsCorrect(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [question?.exampleId, word.id]);

  const submit = () => {
    if (submitted || !question || !input.trim()) return;
    const ok = checkClozeAnswer(input, question.answer);
    setIsCorrect(ok);
    setSubmitted(true);

    void api.post('/cloze/attempts', { exampleId: question.exampleId, correct: ok }).catch(() => {
      // Best-effort: попытка не должна ронять UI.
    });

    timerRef.current = setTimeout(() => onAnswer(ok), 900);
  };

  if (!question) {
    return (
      <View style={styles.card}>
        <Text style={styles.cue}>Подстановка</Text>
        <Text style={styles.hint}>Нет предложений-примеров, содержащих «{word.character}».</Text>
        <Pressable style={styles.submit} onPress={() => onAnswer(false)}>
          <Text style={styles.submitText}>Пропустить</Text>
        </Pressable>
      </View>
    );
  }

  const markerIdx = question.clozeSentence.indexOf(CLOZE_MARKER);
  const before =
    markerIdx === -1 ? question.clozeSentence : question.clozeSentence.slice(0, markerIdx);
  const after =
    markerIdx === -1 ? '' : question.clozeSentence.slice(markerIdx + CLOZE_MARKER.length);

  return (
    <View style={styles.card}>
      <Text style={styles.cue}>Вставь пропущенное слово</Text>
      <Text style={styles.sentence}>
        {before}
        <Text style={styles.blank}>{submitted ? question.answer : CLOZE_MARKER}</Text>
        {after}
      </Text>

      <TextInput
        style={[styles.input, submitted && (isCorrect ? styles.inputCorrect : styles.inputWrong)]}
        value={input}
        onChangeText={setInput}
        placeholder="введите иероглиф или пиньинь…"
        placeholderTextColor="#4A5161"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!submitted}
        onSubmitEditing={submit}
        returnKeyType="done"
      />
      <Pressable
        style={[styles.submit, (submitted || !input.trim()) && styles.submitDisabled]}
        onPress={submit}
        disabled={submitted || !input.trim()}
      >
        <Text style={styles.submitText}>Проверить</Text>
      </Pressable>

      {submitted && (
        <Text style={[styles.feedback, isCorrect ? styles.feedbackOk : styles.feedbackBad]}>
          {isCorrect
            ? `Верно: ${question.answer}`
            : `Правильно: ${question.answer} — ${question.hint}`}
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
    marginBottom: 16,
  },
  sentence: {
    color: '#E8EAED',
    fontSize: 20,
    lineHeight: 30,
    textAlign: 'center',
    marginBottom: 24,
  },
  blank: {
    color: '#4FC3F7',
    fontWeight: '700',
  },
  hint: {
    color: '#7B8497',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
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
