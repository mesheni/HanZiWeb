import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { parsePinyin } from '@hanzi/shared';
import type { MobileWord } from './types';
import { TONE_COLORS_HEX } from './types';

interface Props {
  word: MobileWord;
  onAnswer: (correct: boolean) => void;
  /** F22d: ручное озвучивание слова. */
  onPlayAudio?: () => void;
  /** Доступно ли аудио (дизейбл кнопки). */
  audioAvailable?: boolean;
}

type Tone = 1 | 2 | 3 | 4;
const TONE_OPTIONS: Tone[] = [1, 2, 3, 4];
const TONE_MARKS: Record<Tone, string> = { 1: 'ā', 2: 'á', 3: 'ǎ', 4: 'à' };

function detectTargetTone(pinyin: string): Tone {
  for (const s of parsePinyin(pinyin)) {
    if (s.tone >= 1 && s.tone <= 4) return s.tone as Tone;
  }
  return 1;
}

/** F22d: распознавание тона — выбор тона (1/2/3/4) с озвучкой слова. */
export function ToneRecognitionCard({
  word,
  onAnswer,
  onPlayAudio,
  audioAvailable,
}: Props): React.ReactElement {
  const targetTone = useMemo(() => detectTargetTone(word.pinyin), [word.pinyin]);
  const [selected, setSelected] = useState<Tone | null>(null);

  useEffect(() => {
    setSelected(null);
  }, [word.id]);

  const choose = (tone: Tone) => {
    if (selected !== null) return;
    setSelected(tone);
    onAnswer(tone === targetTone);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cue}>Какой тон?</Text>
      {onPlayAudio ? (
        <Pressable
          style={[styles.audioButton, audioAvailable === false && styles.audioDisabled]}
          onPress={onPlayAudio}
          disabled={audioAvailable === false}
        >
          <Text style={styles.audioButtonText}>
            {audioAvailable === false ? 'Аудио недоступно' : '🔊 Послушать'}
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.hint}>Аудио пока недоступно — выбор наугад</Text>
      )}
      <View style={styles.row}>
        {TONE_OPTIONS.map((tone) => {
          const isTarget = selected !== null && tone === targetTone;
          const isWrong = selected === tone && tone !== targetTone;
          return (
            <Pressable
              key={tone}
              style={[
                styles.tone,
                { borderColor: isTarget || isWrong ? TONE_COLORS_HEX[tone] : '#2A3040' },
                isTarget && styles.toneTarget,
                isWrong && styles.toneWrong,
              ]}
              onPress={() => choose(tone)}
              disabled={selected !== null}
            >
              <Text style={[styles.toneNumber, { color: TONE_COLORS_HEX[tone] }]}>{tone}</Text>
              <Text style={[styles.toneMark, { color: TONE_COLORS_HEX[tone] }]}>
                {TONE_MARKS[tone]}
              </Text>
              {isTarget && <Text style={styles.mark}>✓</Text>}
              {isWrong && <Text style={styles.mark}>✗</Text>}
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
    color: '#E8EAED',
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 10,
  },
  hint: {
    color: '#7B8497',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 36,
  },
  audioButton: {
    backgroundColor: '#1E2330',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignSelf: 'center',
    marginBottom: 36,
  },
  audioButtonText: {
    color: '#4FC3F7',
    fontSize: 15,
    fontWeight: '600',
  },
  audioDisabled: {
    opacity: 0.5,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  tone: {
    width: 68,
    height: 84,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#141820',
    gap: 4,
  },
  toneTarget: {
    backgroundColor: 'rgba(129,199,132,0.12)',
  },
  toneWrong: {
    backgroundColor: 'rgba(229,115,115,0.12)',
  },
  toneNumber: {
    fontSize: 24,
    fontWeight: '700',
  },
  toneMark: {
    fontSize: 18,
  },
  mark: {
    fontSize: 14,
    fontWeight: '700',
  },
});
