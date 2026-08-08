/** Урезанное слово из мобильной сессии (без rich-полей). */
export interface MobileWord {
  id: string;
  character: string;
  pinyin: string;
  translation: string;
}

/** Цвета тонов (web light-палитра, тёмный UI мобилки). */
export const TONE_COLORS_HEX: Record<1 | 2 | 3 | 4, string> = {
  1: '#4FC3F7',
  2: '#81C784',
  3: '#FFB74D',
  4: '#E57373',
};
