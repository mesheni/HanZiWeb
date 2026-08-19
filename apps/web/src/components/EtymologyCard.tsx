import { useEffect, useMemo, useRef, useState } from 'react';
import HanziWriter from 'hanzi-writer';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Loader2,
  PenLine,
  Sparkles,
  Tag,
} from 'lucide-react';
import type { CharacterStructure, Etymology } from '@hanzi/shared';
import { useWordEtymology } from '../queries/etymology';
import { cn } from '../utils/cn';

interface EtymologyCardProps {
  wordId: string;
  /** Иероглиф слова (для отображения пока грузится запрос). */
  fallbackCharacter?: string;
}

const STRUCTURE_LABELS: Record<CharacterStructure, string> = {
  simple: 'простая',
  'left-right': 'слева-справа',
  'top-bottom': 'сверху-снизу',
  surrounding: 'охватывающая',
  overlap: 'сложная',
};

const ROLE_LABELS: Record<'semantic' | 'phonetic' | 'both', string> = {
  semantic: 'смысл',
  phonetic: 'звук',
  both: 'смысл + звук',
};

/**
 * Карточка этимологии иероглифа. Показывает:
 *  - интерактивное разложение: наведение на компонент подсвечивает
 *    его черты на полотне hanzi-writer,
 *  - русское значение одиночного иероглифа и тип происхождения,
 *  - радикал, структуру, число черт,
 *  - этимологическую справку (hint_ru).
 *
 * Если иероглифа нет в датасете (~9,5 тыс. иероглифов, весь HSK) —
 * карточка сворачивается в сообщение «нет разбора».
 */
export default function EtymologyCard({ wordId, fallbackCharacter }: EtymologyCardProps) {
  const { data, isLoading, isError } = useWordEtymology(wordId);
  const [expanded, setExpanded] = useState(true);

  const placeholder = useMemo(
    () => (data?.character ?? fallbackCharacter ?? '?'),
    [data?.character, fallbackCharacter],
  );

  return (
    <div className="word-detail-section etymology-card">
      <div className="word-detail-section-head">
        <span className="word-detail-section-title">Этимология / разбор</span>
        {!isLoading && data && data.found && (
          <button
            type="button"
            className="etymology-toggle"
            onClick={() => setExpanded((s) => !s)}
            aria-label={expanded ? 'Свернуть карточку этимологии' : 'Развернуть карточку этимологии'}
            title={expanded ? 'Свернуть' : 'Развернуть'}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="word-detail-loading">
          <Loader2 size={14} className="spinner-inline" />
        </div>
      ) : isError || !data ? (
        <div className="word-detail-empty">Не удалось загрузить этимологию.</div>
      ) : !data.found ? (
        <EtymologyEmpty character={placeholder} />
      ) : (
        expanded && <EtymologyBody data={data} />
      )}
    </div>
  );
}

function EtymologyEmpty({ character }: { character: string }) {
  return (
    <div className="etymology-empty">
      <BookOpen size={14} />
      <span>
        Для иероглифа <b>{character}</b> пока нет разбора.
      </span>
    </div>
  );
}

function EtymologyBody({ data }: { data: Etymology }) {
  return (
    <div className="etymology-body">
      {data.components.length > 0 ? (
        <DecompositionExplorer data={data} />
      ) : (
        <div className="etymology-character-block">
          <span className="etymology-character">{data.character}</span>
          {data.pinyin && <span className="etymology-character-pinyin">{data.pinyin}</span>}
        </div>
      )}

      <dl className="etymology-meta">
        {data.definitionRu && (
          <div className="etymology-meta-row">
            <dt>Значение</dt>
            <dd>{data.definitionRu}</dd>
          </div>
        )}
        {data.radicalChar && (
          <div className="etymology-meta-row">
            <dt>
              <Tag size={12} /> Радикал
            </dt>
            <dd>
              <span className="etymology-meta-radical-char">{data.radicalChar}</span>
              {data.radicalMeaningRu && (
                <span className="etymology-meta-radical-meaning">— {data.radicalMeaningRu}</span>
              )}
            </dd>
          </div>
        )}
        <div className="etymology-meta-row">
          <dt>Структура</dt>
          <dd>
            <span>{STRUCTURE_LABELS[data.structure]}</span>
            {data.strokeCount !== null && (
              <span className="etymology-meta-strokes"> · {data.strokeCount} черт</span>
            )}
          </dd>
        </div>
        {data.etymologyTypeRu && (
          <div className="etymology-meta-row">
            <dt>Тип</dt>
            <dd>{data.etymologyTypeRu}</dd>
          </div>
        )}
      </dl>

      {(data.hintRu || data.hint) && (
        <div className="etymology-text">
          <div className="etymology-text-label">
            <Sparkles size={12} /> Происхождение
          </div>
          <p>{data.hintRu ?? data.hint}</p>
        </div>
      )}
    </div>
  );
}

function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

const EXPLORER_SIZE = 150;

/**
 * Интерактивное разложение: слева иероглиф на полотне hanzi-writer,
 * справа — чипы компонентов. Наведение/тап на чип скрывает символ и
 * последовательно отрисовывает только черты выбранного компонента
 * (остальные остаются контуром). Клик по полотну возвращает полный
 * символ. Если stroke-данных для иероглифа нет — вместо полотна
 * показывается статичный иероглиф.
 */
function DecompositionExplorer({ data }: { data: Etymology }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<ReturnType<typeof HanziWriter.create> | null>(null);
  const seqRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [writerFailed, setWriterFailed] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';
    setReady(false);
    setWriterFailed(false);
    setActive(null);

    writerRef.current = HanziWriter.create(containerRef.current, data.character, {
      width: EXPLORER_SIZE,
      height: EXPLORER_SIZE,
      padding: 6,
      strokeColor: readCssVar('--text-primary', '#E8EAED'),
      radicalColor: readCssVar('--accent', '#DC2626'),
      outlineColor: readCssVar('--text-muted', '#45475A'),
      showCharacter: true,
      strokeAnimationSpeed: 5,
      charDataLoader: (char, onComplete) => {
        fetch(`/hanzi-writer-data/${encodeURIComponent(char)}.json`)
          .then((res) => res.json())
          .then((json) => onComplete(json))
          .catch(() => setWriterFailed(true));
      },
      onLoadCharDataSuccess: () => setReady(true),
      onLoadCharDataError: () => setWriterFailed(true),
    });

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
      writerRef.current = null;
      seqRef.current += 1;
    };
  }, [data.character]);

  useEffect(() => {
    const writer = writerRef.current;
    if (!writer || !ready) return;

    seqRef.current += 1;
    const seq = seqRef.current;

    if (active === null) {
      writer.showCharacter({ duration: 0 });
      return;
    }

    const component = data.components.find((c) => c.character === active);
    if (!component || component.strokes.length === 0) {
      writer.showCharacter({ duration: 0 });
      return;
    }

    writer.hideCharacter({ duration: 0 });
    const drawNext = (index: number) => {
      if (seqRef.current !== seq || !writerRef.current) return;
      const strokeNum = component.strokes[index];
      if (strokeNum === undefined) return;
      writerRef.current.animateStroke(strokeNum, {
        onComplete: () => drawNext(index + 1),
      });
    };
    drawNext(0);
  }, [active, ready, data.components]);

  return (
    <div className={cn('etymology-decomposition', `etymology-decomposition-${data.structure}`)}>
      <div
        className="etymology-writer"
        onClick={() => setActive(null)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setActive(null)}
        title="Показать весь иероглиф"
      >
        {writerFailed ? (
          <span className="etymology-character">{data.character}</span>
        ) : (
          <div ref={containerRef} className="etymology-writer-canvas" />
        )}
        {data.pinyin && <span className="etymology-character-pinyin">{data.pinyin}</span>}
        {!writerFailed && (
          <span className="etymology-writer-hint">
            <PenLine size={10} />
            {active ? 'покажутся черты компонента' : 'наведите на компонент'}
          </span>
        )}
      </div>
      <div className="etymology-components">
        {data.components.map((c) => (
          <button
            type="button"
            key={`${c.character}-${c.path.join('-')}`}
            className={cn('etymology-component', active === c.character && 'etymology-component-active')}
            onPointerEnter={() => setActive(c.character)}
            onClick={() => setActive((cur) => (cur === c.character ? null : c.character))}
          >
            <div className="etymology-component-char">{c.character}</div>
            <div className="etymology-component-meaning">{c.meaningRu ?? '—'}</div>
            <div className="etymology-component-meta">
              {c.pinyin && <span className="etymology-component-pinyin">{c.pinyin}</span>}
              {c.role && (
                <span className={cn('etymology-component-role', `etymology-role-${c.role}`)}>
                  {ROLE_LABELS[c.role]}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
