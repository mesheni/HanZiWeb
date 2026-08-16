/**
 * Человекочитаемый интервал повторения для подсказки на кнопках оценки.
 * Гранулярность локального FSRS — дни: 0 означает «учим сейчас»
 * (внутренние шаги обучения), поэтому минутные подсказки не показываем.
 */
export function formatInterval(days: number): string {
  if (!Number.isFinite(days) || days < 1) return 'сейчас';
  if (days === 1) return 'завтра';
  if (days < 31) return `${days} ${pluralDays(days)}`;
  return `~${Math.max(1, Math.round(days / 30))} мес`;
}

function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}
