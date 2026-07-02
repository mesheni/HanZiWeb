import { useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Loader2,
  Sigma,
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
 *  - разложение на компоненты с подписями (роль, значение, пиньинь),
 *  - радикал и его значение,
 *  - структурный тип (IDS),
 *  - происхождение и мнемонику.
 *
 * Если данных по иероглифу нет — карточка мягко сворачивается
 * в аккордеон с сообщением «нет данных».
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
        Для иероглифа <b>{character}</b> пока нет разбора. Словарь покрывает HSK 1–2.
      </span>
    </div>
  );
}

function EtymologyBody({ data }: { data: Etymology }) {
  return (
    <div className="etymology-body">
      <Decomposition data={data} />

      <dl className="etymology-meta">
        {data.radical && (
          <div className="etymology-meta-row">
            <dt>
              <Tag size={12} /> Радикал
            </dt>
            <dd>
              <span className="etymology-meta-radical-char">{data.radical.character}</span>
              <span className="etymology-meta-radical-name">{data.radical.name}</span>
              <span className="etymology-meta-radical-meaning">— {data.radical.meaning}</span>
              {data.radical.number !== null && (
                <span className="etymology-meta-radical-number">№{data.radical.number}</span>
              )}
            </dd>
          </div>
        )}
        <div className="etymology-meta-row">
          <dt>
            <Sigma size={12} /> Структура
          </dt>
          <dd>
            <span>{STRUCTURE_LABELS[data.structure]}</span>
            {data.strokeCount !== null && <span className="etymology-meta-strokes"> · {data.strokeCount} черт</span>}
          </dd>
        </div>
      </dl>

      {data.etymology && (
        <div className="etymology-text">
          <div className="etymology-text-label">
            <Sparkles size={12} /> Происхождение
          </div>
          <p>{data.etymology}</p>
        </div>
      )}

      {data.mnemonic && (
        <div className="etymology-text etymology-text-mnemonic">
          <div className="etymology-text-label">
            <Lightbulb size={12} /> Мнемоника
          </div>
          <p>{data.mnemonic}</p>
        </div>
      )}
    </div>
  );
}

function Decomposition({ data }: { data: Etymology }) {
  // Простая «развёртка» — список компонентов. Для структур
  // left-right/top-bottom/surrounding визуально группируем.
  const layout = layoutForStructure(data);

  return (
    <div className={cn('etymology-decomposition', `etymology-decomposition-${layout}`)}>
      <div className="etymology-character-block">
        <span className="etymology-character">{data.character}</span>
        {data.pinyin && <span className="etymology-character-pinyin">{data.pinyin}</span>}
      </div>
      <div className="etymology-components">
        {data.components.length === 0 ? (
          <span className="etymology-component-empty">нет данных о составе</span>
        ) : (
          data.components.map((c, i) => (
            <div key={`${c.character}-${i}`} className="etymology-component">
              <div className="etymology-component-char">{c.character}</div>
              <div className="etymology-component-meaning">{c.meaning}</div>
              <div className="etymology-component-meta">
                {c.pinyin && <span className="etymology-component-pinyin">{c.pinyin}</span>}
                <span className={cn('etymology-component-role', `etymology-role-${c.role}`)}>
                  {ROLE_LABELS[c.role]}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function layoutForStructure(data: Etymology): string {
  switch (data.structure) {
    case 'left-right':
    case 'top-bottom':
    case 'surrounding':
    case 'overlap':
      return data.structure;
    default:
      return 'simple';
  }
}
