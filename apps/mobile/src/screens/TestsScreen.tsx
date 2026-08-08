import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../bootstrap';
import type { RootStackParamList } from '../navigation/types';
import type { TestSession, TestQuestionPublic, TestLevel } from '@hanzi/shared';

interface TestResultData {
  level: TestLevel;
  correctAnswers: number;
  totalQuestions: number;
  percentage: number;
  timeSpentMs: number;
}

type Nav = NativeStackNavigationProp<RootStackParamList, 'Tests'>;

const LEVELS: TestLevel[] = [1, 2, 3, 4, 5, 6];

/** F22c: HSK-тесты — выбор уровня, прохождение вопросов, результат. */
export function TestsScreen(): React.ReactElement | null {
  const navigation = useNavigation<Nav>();
  const [phase, setPhase] = useState<'levels' | 'in-progress' | 'result'>('levels');
  const [session, setSession] = useState<TestSession | null>(null);
  const [result, setResult] = useState<TestResultData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const startedAtRef = useRef(Date.now());

  const startTest = async (level: TestLevel) => {
    setLoading(true);
    setError(null);
    const res = await api.post<TestSession>('/tests/start', { level });
    setLoading(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setSession(res.data);
    setCurrentIndex(0);
    startedAtRef.current = Date.now();
    setPhase('in-progress');
  };

  const submitTest = useCallback(
    async (answers: Array<{ questionId: string; answer: string }>) => {
      if (!session) return;
      setLoading(true);
      const res = await api.post<TestResultData>(`/tests/${session.id}/submit`, {
        answers,
        timeSpentMs: Date.now() - startedAtRef.current,
      });
      setLoading(false);
      if (!res.ok) {
        Alert.alert('Ошибка', res.message);
        setPhase('levels');
        return;
      }
      setResult(res.data);
      setPhase('result');
    },
    [session],
  );

  if (phase === 'levels') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={styles.back}>←</Text>
          </Pressable>
          <Text style={styles.title}>Тесты HSK</Text>
          <View style={styles.headerSpacer} />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.hint}>Выбери уровень и проверь свои знания.</Text>
          {LEVELS.map((level) => (
            <Pressable
              key={level}
              style={styles.levelCard}
              onPress={() => void startTest(level)}
              disabled={loading}
            >
              <Text style={styles.levelNumber}>HSK {level}</Text>
              <Text style={styles.levelArrow}>{loading ? '…' : '→'}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === 'result' && result) {
    const passed = result.percentage >= 60;
    const seconds = Math.round(result.timeSpentMs / 1000);
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <Text style={[styles.resultPct, passed ? styles.resultPass : styles.resultFail]}>
            {result.percentage}%
          </Text>
          <Text style={styles.resultLabel}>
            {result.correctAnswers} / {result.totalQuestions} правильных · {seconds} с
          </Text>
          <Text style={styles.resultVerdict}>{passed ? 'Тест сдан 🎉' : 'Попробуй ещё раз'}</Text>
          <Pressable
            style={styles.resultButton}
            onPress={() => {
              setPhase('levels');
              setSession(null);
            }}
          >
            <Text style={styles.resultButtonText}>К уровням</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) return null;

  const question = session.questions[currentIndex];
  if (!question) return null;
  const answeredCount = currentIndex; // вопросы отвечены до текущего
  const isLast = currentIndex === session.questions.length - 1;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => setPhase('levels')} hitSlop={12}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>
          HSK {session.level} · {currentIndex + 1}/{session.questions.length}
        </Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${session.questions.length > 0 ? (answeredCount / session.questions.length) * 100 : 0}%`,
            },
          ]}
        />
      </View>

      <QuestionView
        question={question}
        onAnswered={(answer) => {
          const nextAnswers = [...(session.answers ?? []), { questionId: question.id, answer }];
          if (isLast) {
            void submitTest(nextAnswers);
          } else {
            setSession((prev) => (prev ? { ...prev, answers: nextAnswers } : prev));
            setCurrentIndex((i) => i + 1);
          }
        }}
      />
    </SafeAreaView>
  );
}

/** F22c: рендер одного вопроса по типу. */
function QuestionView({
  question,
  onAnswered,
}: {
  question: TestQuestionPublic;
  onAnswered: (answer: string) => void;
}): React.ReactElement {
  const [value, setValue] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setValue('');
    setChosen([]);
    setSelected(null);
    setSubmitted(false);
  }, [question.id]);

  const chooseOption = (option: string) => {
    if (submitted) return;
    setSelected(option);
    setSubmitted(true);
    onAnswered(option);
  };

  const submitFreeText = () => {
    if (submitted || !value.trim()) return;
    setSubmitted(true);
    onAnswered(value.trim());
  };

  const submitAssembly = () => {
    if (submitted || chosen.length === 0) return;
    setSubmitted(true);
    onAnswered(chosen.join(''));
  };

  const prompt = (() => {
    switch (question.type) {
      case 'multiple-choice-translation':
      case 'pinyin-input':
      case 'character-assembly':
        return question.wordCharacter;
      case 'reverse-choice-character':
        return question.wordTranslation;
      case 'tone-recognition':
        return question.wordCharacter;
      case 'cloze':
        return question.wordCharacter;
    }
  })();

  const title = (() => {
    switch (question.type) {
      case 'multiple-choice-translation':
        return 'Выбери перевод';
      case 'reverse-choice-character':
        return 'Выбери иероглиф';
      case 'pinyin-input':
        return 'Набери пиньинь';
      case 'tone-recognition':
        return 'Какой тон у первого слога?';
      case 'character-assembly':
        return 'Собери слово';
      case 'cloze':
        return 'Вставь слово';
    }
  })();

  return (
    <View style={styles.questionBody}>
      <Text style={styles.questionTitle}>{title}</Text>
      <Text style={styles.questionPrompt}>{prompt}</Text>

      {question.type === 'pinyin-input' && (
        <>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            placeholder="например, xǐ huān"
            placeholderTextColor="#4A5161"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitted}
            onSubmitEditing={submitFreeText}
            returnKeyType="done"
          />
          <Pressable
            style={[styles.submitBtn, (submitted || !value.trim()) && styles.disabled]}
            onPress={submitFreeText}
            disabled={submitted || !value.trim()}
          >
            <Text style={styles.submitText}>Ответить</Text>
          </Pressable>
        </>
      )}

      {question.type === 'tone-recognition' && (
        <>
          <Text style={styles.toneHint}>{question.wordPinyin}</Text>
          <View style={styles.toneRow}>
            {['1', '2', '3', '4'].map((t) => (
              <Pressable
                key={t}
                style={[
                  styles.toneBtn,
                  selected === t && styles.toneBtnSelected,
                  submitted && styles.disabled,
                ]}
                onPress={() => chooseOption(t)}
                disabled={submitted}
              >
                <Text style={styles.toneBtnText}>{t}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.smallHint}>Пока без аудио — по пиньиню (аудио в F22d).</Text>
        </>
      )}

      {(question.type === 'multiple-choice-translation' ||
        question.type === 'reverse-choice-character') && (
        <View style={styles.optionList}>
          {question.options.map((option) => (
            <Pressable
              key={option}
              style={[
                styles.optionBtn,
                selected === option && styles.optionSelected,
                submitted && styles.disabled,
              ]}
              onPress={() => chooseOption(option)}
              disabled={submitted}
            >
              <Text style={styles.optionText}>{option}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {question.type === 'character-assembly' && (
        <>
          <View style={styles.assemblyZone}>
            {chosen.length === 0 ? (
              <Text style={styles.placeholder}>Нажимай на иероглифы снизу</Text>
            ) : (
              <View style={styles.chips}>
                {chosen.map((ch, i) => (
                  <Pressable
                    key={`${i}-${ch}`}
                    style={styles.chip}
                    onPress={() => {
                      if (submitted) return;
                      setChosen((c) => c.filter((_, idx) => idx !== i));
                    }}
                  >
                    <Text style={styles.chipText}>{ch}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
          <View style={styles.chips}>
            {(question.characterPool ?? []).map((ch, i) => (
              <Pressable
                key={`${i}-${ch}`}
                style={[styles.chip, submitted && styles.disabled]}
                onPress={() => {
                  if (submitted) return;
                  setChosen((c) => [...c, ch]);
                }}
                disabled={submitted}
              >
                <Text style={styles.chipText}>{ch}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={[styles.submitBtn, (submitted || chosen.length === 0) && styles.disabled]}
            onPress={submitAssembly}
            disabled={submitted || chosen.length === 0}
          >
            <Text style={styles.submitText}>Ответить</Text>
          </Pressable>
        </>
      )}

      {question.type === 'cloze' && (
        <>
          <Text style={styles.clozeSentence}>{question.clozeSentence}</Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            placeholder="введите иероглиф"
            placeholderTextColor="#4A5161"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitted}
            onSubmitEditing={submitFreeText}
            returnKeyType="done"
          />
          <Pressable
            style={[styles.submitBtn, (submitted || !value.trim()) && styles.disabled]}
            onPress={submitFreeText}
            disabled={submitted || !value.trim()}
          >
            <Text style={styles.submitText}>Ответить</Text>
          </Pressable>
        </>
      )}
    </View>
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
    padding: 16,
    gap: 8,
  },
  back: {
    color: '#4FC3F7',
    fontSize: 22,
    width: 28,
  },
  title: {
    color: '#E8EAED',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 28,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#141820',
    marginHorizontal: 16,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4FC3F7',
  },
  list: {
    padding: 16,
  },
  hint: {
    color: '#7B8497',
    fontSize: 14,
    marginBottom: 16,
  },
  levelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141820',
    borderRadius: 14,
    padding: 18,
    marginBottom: 10,
  },
  levelNumber: {
    color: '#E8EAED',
    fontSize: 18,
    fontWeight: '700',
  },
  levelArrow: {
    color: '#4FC3F7',
    fontSize: 18,
  },
  error: {
    color: '#E57373',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  questionBody: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  questionTitle: {
    color: '#7B8497',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
  },
  questionPrompt: {
    color: '#E8EAED',
    fontSize: 52,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 28,
  },
  input: {
    backgroundColor: '#1E2330',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: '#E8EAED',
    fontSize: 18,
  },
  submitBtn: {
    backgroundColor: '#4FC3F7',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  submitText: {
    color: '#0C0E16',
    fontSize: 16,
    fontWeight: '700',
  },
  optionList: {
    gap: 10,
  },
  optionBtn: {
    backgroundColor: '#1E2330',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  optionSelected: {
    backgroundColor: 'rgba(79,195,247,0.15)',
    borderWidth: 1,
    borderColor: '#4FC3F7',
  },
  optionText: {
    color: '#E8EAED',
    fontSize: 17,
    textAlign: 'center',
  },
  toneRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  toneBtn: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: '#1E2330',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toneBtnSelected: {
    backgroundColor: 'rgba(79,195,247,0.15)',
    borderWidth: 1,
    borderColor: '#4FC3F7',
  },
  toneBtnText: {
    color: '#E8EAED',
    fontSize: 22,
    fontWeight: '700',
  },
  toneHint: {
    color: '#7B8497',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  smallHint: {
    color: '#4A5161',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
  },
  assemblyZone: {
    minHeight: 64,
    borderRadius: 12,
    backgroundColor: '#141820',
    padding: 10,
    justifyContent: 'center',
    marginBottom: 12,
  },
  placeholder: {
    color: '#4A5161',
    fontSize: 14,
    textAlign: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  chip: {
    backgroundColor: '#1E2330',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  chipText: {
    color: '#E8EAED',
    fontSize: 22,
  },
  clozeSentence: {
    color: '#E8EAED',
    fontSize: 19,
    lineHeight: 29,
    textAlign: 'center',
    marginBottom: 24,
  },
  disabled: {
    opacity: 0.5,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  resultPct: {
    fontSize: 64,
    fontWeight: '700',
  },
  resultPass: {
    color: '#81C784',
  },
  resultFail: {
    color: '#E57373',
  },
  resultLabel: {
    color: '#7B8497',
    fontSize: 15,
    marginTop: 8,
  },
  resultVerdict: {
    color: '#E8EAED',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  resultButton: {
    backgroundColor: '#4FC3F7',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 28,
  },
  resultButtonText: {
    color: '#0C0E16',
    fontSize: 16,
    fontWeight: '700',
  },
});
