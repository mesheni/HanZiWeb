/**
 * Чистые функции для FSRS-инсайтов на экране статистики. Работают по
 * локальному зеркалу прогресса (коллекция progress в RxDB) — сервер не
 * опрашивается. Форма входа минимальна, чтобы функции были тестируемыми.
 */

export interface FsrsInsightDoc {
  state: string;
  stability: number;
  difficulty: number;
  dueDate: string;
}

export interface HistogramBin {
  label: string;
  count: number;
}

const DAY_MS = 86_400_000;

/** Разница в календарных днях (устойчива к переходу на летнее время). */
function calendarDayDiff(from: Date, to: number): number {
  const d = new Date(to);
  return (
    (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) -
      Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) /
    DAY_MS
  );
}

export interface DueForecast {
  /** Просроченные на момент `now` (dueDate раньше начала сегодня). */
  overdue: number;
  /** Повторения по дням: индекс 0 — сегодня, 1 — завтра и т.д. */
  perDay: number[];
}

export function computeDueForecast(
  docs: FsrsInsightDoc[],
  now: Date = new Date(),
  days: number = 14,
): DueForecast {
  const perDay = new Array<number>(days).fill(0);
  let overdue = 0;
  for (const doc of docs) {
    const t = Date.parse(doc.dueDate);
    if (Number.isNaN(t)) continue;
    const diff = calendarDayDiff(now, t);
    if (diff < 0) {
      overdue++;
    } else if (diff < days) {
      perDay[diff]! += 1;
    }
  }
  return { overdue, perDay };
}

export function computeStabilityHistogram(docs: FsrsInsightDoc[]): HistogramBin[] {
  const bins: Array<{ label: string; max: number; count: number }> = [
    { label: '<1 д', max: 1, count: 0 },
    { label: '1–3 д', max: 3, count: 0 },
    { label: '3–7 д', max: 7, count: 0 },
    { label: '7–21 д', max: 21, count: 0 },
    { label: '21+ д', max: Infinity, count: 0 },
  ];
  for (const doc of docs) {
    for (const bin of bins) {
      if (doc.stability <= bin.max) {
        bin.count++;
        break;
      }
    }
  }
  return bins.map(({ label, count }) => ({ label, count }));
}

/** Difficulty — каноническая FSRS-5 шкала [1, 10]; ниже — «легче». */
export function computeDifficultyHistogram(docs: FsrsInsightDoc[]): HistogramBin[] {
  const bins: Array<{ label: string; max: number; count: number }> = [
    { label: '1–3 лёгкие', max: 3, count: 0 },
    { label: '4–5', max: 5, count: 0 },
    { label: '6–7', max: 7, count: 0 },
    { label: '8–10 сложные', max: 10, count: 0 },
  ];
  for (const doc of docs) {
    // Округляем до целого: дробная сложность распределяется по ближайшей
    // категории, а подписи бакетов остаются человекочитаемыми.
    const d = Math.round(doc.difficulty);
    for (const bin of bins) {
      if (d <= bin.max) {
        bin.count++;
        break;
      }
    }
  }
  return bins.map(({ label, count }) => ({ label, count }));
}

const STATE_LABELS: Record<string, string> = {
  new: 'Новые',
  learning: 'Учу',
  review: 'Повтор',
  graduated: 'Усвоено',
};

export function computeStateDistribution(docs: FsrsInsightDoc[]): HistogramBin[] {
  const counts = new Map<string, number>();
  for (const doc of docs) {
    counts.set(doc.state, (counts.get(doc.state) ?? 0) + 1);
  }
  return ['new', 'learning', 'review', 'graduated'].map((state) => ({
    label: STATE_LABELS[state] ?? state,
    count: counts.get(state) ?? 0,
  }));
}
