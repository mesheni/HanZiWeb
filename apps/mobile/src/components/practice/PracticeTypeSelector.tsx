import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PracticeType } from '@hanzi/shared';

interface PracticeMeta {
  id: PracticeType;
  label: string;
  description: string;
  color: string;
}

const PRACTICE_META: PracticeMeta[] = [
  {
    id: 'flip-card',
    label: 'Карточки',
    description: 'Классический flip — иероглиф → перевод',
    color: '#A78BFA',
  },
  {
    id: 'multiple-choice',
    label: 'Выбор перевода',
    description: 'Китайский → 4 варианта перевода',
    color: '#4FC3F7',
  },
  {
    id: 'reverse-choice',
    label: 'Выбор иероглифа',
    description: 'Перевод → 4 варианта иероглифа',
    color: '#81C784',
  },
  {
    id: 'pinyin-input',
    label: 'Ввод пиньиня',
    description: 'Набери пиньинь по иероглифу',
    color: '#FFB74D',
  },
  {
    id: 'tone-recognition',
    label: 'Тон на слух',
    description: 'Выбери тон (1/2/3/4)',
    color: '#E57373',
  },
  {
    id: 'syllable-constructor',
    label: 'Собери пиньинь',
    description: 'Собери слоги пиньиня в порядке',
    color: '#BA68C8',
  },
  {
    id: 'cloze',
    label: 'Подстановка',
    description: 'Вставь слово в предложение-пример',
    color: '#F472B6',
  },
];

const TRAINING_IDS: ReadonlySet<PracticeType> = new Set([
  'multiple-choice',
  'reverse-choice',
  'pinyin-input',
  'tone-recognition',
  'syllable-constructor',
  'cloze',
]);

interface Props {
  onStart: (practiceType: PracticeType) => void;
  onCancel?: () => void;
}

/** F22a: экран выбора типа практики (мобильный аналог web-селектора). */
export function PracticeTypeSelector({ onStart, onCancel }: Props): React.ReactElement {
  const [selected, setSelected] = useState<PracticeType>('flip-card');
  const study = PRACTICE_META.filter((p) => !TRAINING_IDS.has(p.id));
  const training = PRACTICE_META.filter((p) => TRAINING_IDS.has(p.id));

  const renderType = (meta: PracticeMeta) => {
    const isActive = selected === meta.id;
    const isTraining = TRAINING_IDS.has(meta.id);
    return (
      <Pressable
        key={meta.id}
        style={[
          styles.typeCard,
          isActive && { borderColor: meta.color, backgroundColor: `${meta.color}22` },
        ]}
        onPress={() => setSelected(meta.id)}
      >
        <View style={[styles.typeIcon, { backgroundColor: `${meta.color}33` }]}>
          <Text style={[styles.typeIconDot, { color: meta.color }]}>字</Text>
        </View>
        <View style={styles.typeText}>
          <Text style={styles.typeLabel}>{meta.label}</Text>
          <Text style={styles.typeDesc}>{meta.description}</Text>
        </View>
        {isTraining && <Text style={styles.trainingBadge}>Тренировка</Text>}
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.eyebrow}>Тип практики</Text>
        <Text style={styles.title}>Выбери формат тренировки</Text>

        <Text style={styles.sectionLabel}>Изучение · влияет на прогресс</Text>
        {study.map(renderType)}

        <Text style={styles.sectionLabel}>Тренировка · не влияет на прогресс</Text>
        {training.map(renderType)}
      </ScrollView>

      <View style={styles.actions}>
        {onCancel && (
          <Pressable onPress={onCancel} hitSlop={12}>
            <Text style={styles.cancel}>Назад</Text>
          </Pressable>
        )}
        <Pressable style={styles.start} onPress={() => onStart(selected)}>
          <Text style={styles.startText}>
            Начать: {PRACTICE_META.find((p) => p.id === selected)?.label ?? selected}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0C0E16',
  },
  scroll: {
    padding: 20,
    paddingBottom: 32,
  },
  eyebrow: {
    color: '#7B8497',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  title: {
    color: '#E8EAED',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 20,
  },
  sectionLabel: {
    color: '#7B8497',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 18,
    marginBottom: 10,
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141820',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 12,
  },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeIconDot: {
    fontSize: 18,
    fontWeight: '600',
  },
  typeText: {
    flex: 1,
  },
  typeLabel: {
    color: '#E8EAED',
    fontSize: 16,
    fontWeight: '600',
  },
  typeDesc: {
    color: '#7B8497',
    fontSize: 12,
    marginTop: 2,
  },
  trainingBadge: {
    color: '#FFB74D',
    fontSize: 11,
    fontWeight: '600',
  },
  actions: {
    padding: 20,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#141820',
    gap: 12,
  },
  cancel: {
    color: '#7B8497',
    fontSize: 15,
    textAlign: 'center',
  },
  start: {
    backgroundColor: '#4FC3F7',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startText: {
    color: '#0C0E16',
    fontSize: 17,
    fontWeight: '700',
  },
});
