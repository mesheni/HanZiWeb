import { useState, useEffect, useMemo } from 'react';
import { Volume2, Lightbulb, X, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { useTags, type TagWithCount } from '../queries/tags';
import type { SessionFilters } from '@hanzi/shared';

/** Поля, реально используемые панелью фильтров. */
export interface SessionFiltersValue {
  minStability?: number;
  maxStability?: number;
  tags?: string[];
  onlyWithAudio?: boolean;
  onlyWithMnemonic?: boolean;
  /** Любой из фильтров активен? Используется родителем для badge. */
  enabled: boolean;
}

/** Превращает значение панели в `SessionFilters` для API (или `undefined`). */
export function toSessionFilters(v: SessionFiltersValue): SessionFilters | undefined {
  if (!v.enabled) return undefined;
  const out: SessionFilters = {};
  if (v.minStability !== undefined) out.minStability = v.minStability;
  if (v.maxStability !== undefined) out.maxStability = v.maxStability;
  if (v.tags && v.tags.length > 0) out.tags = v.tags;
  if (v.onlyWithAudio === true) out.onlyWithAudio = true;
  if (v.onlyWithMnemonic === true) out.onlyWithMnemonic = true;
  return Object.keys(out).length > 0 ? out : undefined;
}

interface SessionFiltersPanelProps {
  /** Текущее значение фильтров. */
  value: SessionFiltersValue;
  /** Колбэк при изменении. */
  onChange: (next: SessionFiltersValue) => void;
  /** Режим сессии — влияет на видимость подсказок. */
  mode: 'mixed' | 'review' | 'learn';
}

/**
 * Панель фильтров сессии (PLAN_Features_v0.2 §12).
 *
 * Позволяет настроить:
 * - `minStability` / `maxStability` — диапазон «лёгкости» по FSRS.
 * - `tags` — выбор одного или нескольких тегов (OR-логика).
 * - `onlyWithAudio` / `onlyWithMnemonic` — toggle-фильтры.
 */
export default function SessionFiltersPanel({
  value,
  onChange,
  mode,
}: SessionFiltersPanelProps) {
  const { data: tags = [] } = useTags();
  const [expanded, setExpanded] = useState(value.enabled);

  // Сворачиваем панель, если фильтры сброшены снаружи.
  useEffect(() => {
    if (!value.enabled) setExpanded(false);
  }, [value.enabled]);

  const selectedTagIds = useMemo(
    () => new Set(value.tags ?? []),
    [value.tags],
  );

  const update = (patch: Partial<SessionFiltersValue>) => {
    const next: SessionFiltersValue = {
      ...value,
      ...patch,
    };
    next.enabled = isFilterActive(next);
    onChange(next);
  };

  const clearAll = () => onChange({ enabled: false });

  const hasAudio = value.onlyWithAudio === true;
  const hasMnemonic = value.onlyWithMnemonic === true;
  const hasStability =
    value.minStability !== undefined || value.maxStability !== undefined;
  const hasTags = (value.tags?.length ?? 0) > 0;

  return (
    <div style={styles.wrap}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={styles.header}
        aria-expanded={expanded}
      >
        <span style={styles.headerLeft}>
          <Filter size={14} />
          <span style={styles.headerLabel}>Фильтры сессии</span>
          {value.enabled && (
            <span style={styles.activeBadge}>
              {[
                hasStability && 'стабильность',
                hasTags && `${value.tags!.length} тег${plural(value.tags!.length)}`,
                hasAudio && 'аудио',
                hasMnemonic && 'мнемоника',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded && (
        <div style={styles.body}>
          {/* Stability range */}
          <div style={styles.row}>
            <label style={styles.rowLabel}>Стабильность (дни)</label>
            <div style={styles.rangeRow}>
              <NumberInput
                value={value.minStability}
                placeholder="мин"
                onChange={(v) => update({ minStability: v })}
                width={64}
              />
              <span style={styles.dash}>—</span>
              <NumberInput
                value={value.maxStability}
                placeholder="макс"
                onChange={(v) => update({ maxStability: v })}
                width={64}
              />
            </div>
            {mode === 'learn' && (
              <small style={styles.hint}>
                В режиме «Учить новые» stability всегда 0 — фильтр не действует на новые слова.
              </small>
            )}
          </div>

          {/* Tags */}
          <div style={styles.row}>
            <label style={styles.rowLabel}>Теги</label>
            {tags.length === 0 ? (
              <small style={styles.hint}>Сначала создайте теги в Настройках.</small>
            ) : (
              <div style={styles.tagList}>
                {tags.map((tag) => (
                  <TagChip
                    key={tag.id}
                    tag={tag}
                    selected={selectedTagIds.has(tag.id)}
                    onToggle={() => {
                      const current = value.tags ?? [];
                      const nextTags = selectedTagIds.has(tag.id)
                        ? current.filter((id) => id !== tag.id)
                        : [...current, tag.id];
                      update({ tags: nextTags.length > 0 ? nextTags : undefined });
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Toggles */}
          <div style={styles.row}>
            <Toggle
              icon={<Volume2 size={14} />}
              label="Только со звуком"
              checked={hasAudio}
              onChange={(v) => update({ onlyWithAudio: v ? true : undefined })}
            />
            <Toggle
              icon={<Lightbulb size={14} />}
              label="Только с мнемоникой"
              checked={hasMnemonic}
              onChange={(v) => update({ onlyWithMnemonic: v ? true : undefined })}
            />
          </div>

          {value.enabled && (
            <button type="button" onClick={clearAll} style={styles.clearBtn}>
              <X size={14} /> Сбросить фильтры
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NumberInput({
  value,
  placeholder,
  onChange,
  width,
}: {
  value: number | undefined;
  placeholder: string;
  onChange: (v: number | undefined) => void;
  width: number;
}) {
  return (
    <input
      type="number"
      min={0}
      step="0.1"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '') return onChange(undefined);
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) onChange(n);
      }}
      style={{ ...styles.numInput, width }}
    />
  );
}

function TagChip({
  tag,
  selected,
  onToggle,
}: {
  tag: TagWithCount;
  selected: boolean;
  onToggle: () => void;
}) {
  const color = tag.color ? `#${tag.color}` : 'var(--accent)';
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        ...styles.chip,
        borderColor: selected ? color : 'var(--border-default)',
        background: selected ? `${color}22` : 'var(--bg-card)',
        color: selected ? color : 'var(--text-secondary)',
      }}
      aria-pressed={selected}
    >
      {tag.name}
      <small style={styles.chipCount}>{tag.wordCount}</small>
    </button>
  );
}

function Toggle({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        ...styles.toggle,
        background: checked ? 'var(--accent)' : 'var(--bg-card)',
        color: checked ? '#fff' : 'var(--text-secondary)',
        borderColor: checked ? 'var(--accent)' : 'var(--border-default)',
      }}
      aria-pressed={checked}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function plural(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return '';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'а';
  return 'ов';
}

function isFilterActive(f: SessionFiltersValue): boolean {
  return Boolean(
    f.minStability !== undefined ||
      f.maxStability !== undefined ||
      (f.tags && f.tags.length > 0) ||
      f.onlyWithAudio === true ||
      f.onlyWithMnemonic === true,
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '10px 14px',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  headerLeft: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  },
  headerLabel: {
    fontSize: 13,
  },
  activeBadge: {
    fontSize: 10,
    color: 'var(--accent)',
    background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
    padding: '2px 8px',
    borderRadius: 10,
    fontWeight: 500,
    marginLeft: 4,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    padding: '4px 14px 14px',
    borderTop: '1px solid var(--border-default)',
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  rowLabel: {
    fontSize: 11,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: 500,
  },
  rangeRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  dash: {
    color: 'var(--text-muted)',
    fontSize: 14,
  },
  numInput: {
    padding: '6px 8px',
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    background: 'var(--bg-screen)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
  },
  hint: {
    fontSize: 11,
    color: 'var(--text-muted)',
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 10px',
    border: '1px solid',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  chipCount: {
    fontSize: 10,
    opacity: 0.7,
  },
  toggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 12px',
    border: '1px solid',
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  clearBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    padding: '5px 10px',
    background: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    color: 'var(--text-muted)',
    fontSize: 11,
    cursor: 'pointer',
  },
};
