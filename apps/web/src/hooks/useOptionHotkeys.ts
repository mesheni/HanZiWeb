import { useEffect } from 'react';
import { useUiStore } from '../stores/uiStore';

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  );
}

/**
 * Горячие клавиши выбора варианта для choice-карточек: цифры 1–9
 * выбирают вариант с соответствующим индексом. События из полей ввода
 * и во время композиции (IME — важно для ввода иероглифов) игнорируются,
 * как и нажатия при открытой шпаргалке по клавишам.
 */
export function useOptionHotkeys(
  optionCount: number,
  onSelect: (index: number) => void,
  enabled: boolean = true,
): void {
  const shortcutsOverlayOpen = useUiStore((s) => s.shortcutsOverlayOpen);

  useEffect(() => {
    if (!enabled || shortcutsOverlayOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.isComposing) return;
      if (isTypingTarget(e.target)) return;
      const index = Number(e.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= optionCount) return;
      e.preventDefault();
      onSelect(index);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [optionCount, onSelect, enabled, shortcutsOverlayOpen]);
}
