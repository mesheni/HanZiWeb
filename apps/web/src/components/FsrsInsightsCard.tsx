import { useEffect, useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { getDb } from '../db/database';
import type { ProgressDoc } from '../db/database';
import {
  computeDueForecast,
  computeStabilityHistogram,
  computeDifficultyHistogram,
  computeStateDistribution,
  type FsrsInsightDoc,
  type HistogramBin,
} from '../utils/fsrsInsights';

const WEEKDAY_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/**
 * FSRS-инсайты на экране статистики: прогноз повторений на 14 дней и
 * распределения stability/difficulty/состояний. Считается по локальному
 * зеркалу прогресса (RxDB) — без запросов к серверу; поэтому после
 * ответов на другом устройстве картина обновится после sync.
 */
export default function FsrsInsightsCard() {
  const [docs, setDocs] = useState<FsrsInsightDoc[] | null>(null);

  useEffect(() => {
    const db = getDb();
    if (!db) {
      setDocs([]);
      return;
    }
    let cancelled = false;
    const sub = db.progress.find().$.subscribe((rows) => {
      if (cancelled) return;
      setDocs(
        rows.map((r) => {
          const d = r.toJSON() as ProgressDoc;
          return {
            state: d.state,
            stability: d.stability,
            difficulty: d.difficulty,
            dueDate: d.dueDate,
          };
        }),
      );
    });
    return () => {
      cancelled = true;
      sub.unsubscribe();
    };
  }, []);

  const forecast = useMemo(() => computeDueForecast(docs ?? []), [docs]);
  const stabilityBins = useMemo(() => computeStabilityHistogram(docs ?? []), [docs]);
  const difficultyBins = useMemo(() => computeDifficultyHistogram(docs ?? []), [docs]);
  const stateBins = useMemo(() => computeStateDistribution(docs ?? []), [docs]);

  if (docs === null) {
    return (
      <div className="lb-loading">
        <span className="spinner" style={{ width: 16, height: 16 }} />
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="lb-empty">
        <CalendarClock size={14} />
        <span>Пройдите первую сессию — здесь появится прогноз повторений.</span>
      </div>
    );
  }

  const days = forecast.perDay;
  const maxDay = Math.max(1, ...days);
  const totalUpcoming = days.reduce((a, b) => a + b, 0);

  return (
    <div className="fsrs-insights">
      <div className="fsrs-forecast-summary">
        {forecast.overdue > 0 && (
          <span className="fsrs-chip fsrs-chip-overdue">просрочено: {forecast.overdue}</span>
        )}
        <span className="fsrs-chip">на 2 недели: {totalUpcoming}</span>
      </div>

      <div className="fsrs-forecast" role="img" aria-label="Прогноз повторений на 14 дней">
        {days.map((count, i) => {
          const date = new Date();
          date.setDate(date.getDate() + i);
          return (
            <div key={i} className="fsrs-forecast-col" title={`${count} повторений`}>
              <span className="fsrs-forecast-count">{count > 0 ? count : ''}</span>
              <div
                className={`fsrs-forecast-bar${i === 0 ? ' fsrs-forecast-bar-today' : ''}`}
                style={{ height: `${Math.max(count > 0 ? 6 : 2, (count / maxDay) * 64)}px` }}
              />
              <span className="fsrs-forecast-day">{WEEKDAY_SHORT[date.getDay()]}</span>
            </div>
          );
        })}
      </div>

      <div className="fsrs-histos">
        <Histogram title="Стабильность" bins={stabilityBins} />
        <Histogram title="Сложность" bins={difficultyBins} />
        <Histogram title="Состояния" bins={stateBins} />
      </div>

      <p className="fsrs-note">по локальному зеркалу прогресса</p>
    </div>
  );
}

function Histogram({ title, bins }: { title: string; bins: HistogramBin[] }) {
  const max = Math.max(1, ...bins.map((b) => b.count));
  return (
    <div className="fsrs-histo">
      <div className="fsrs-histo-title">{title}</div>
      {bins.map((bin) => (
        <div key={bin.label} className="fsrs-histo-row">
          <span className="fsrs-histo-label">{bin.label}</span>
          <div className="fsrs-histo-track">
            <div className="fsrs-histo-fill" style={{ width: `${(bin.count / max) * 100}%` }} />
          </div>
          <span className="fsrs-histo-count">{bin.count}</span>
        </div>
      ))}
    </div>
  );
}
