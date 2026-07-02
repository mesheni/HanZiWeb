import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface UiState {
  theme: Theme;
  sidebarOpen: boolean;
  /** Автоматически проигрывать TTS при появлении новой карточки в StudyScreen. */
  autoPlayAudio: boolean;

  toggleTheme: () => void;
  setSidebarOpen: (open: boolean) => void;
  setAutoPlayAudio: (on: boolean) => void;
}

const STORAGE_KEY = 'hanzi:ui';

interface PersistedSlice {
  theme: Theme;
  sidebarOpen: boolean;
  autoPlayAudio: boolean;
}

function loadInitial(): PersistedSlice {
  if (typeof window === 'undefined') {
    return { theme: 'dark', sidebarOpen: true, autoPlayAudio: true };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { theme: 'dark', sidebarOpen: true, autoPlayAudio: true };
    const parsed = JSON.parse(raw) as Partial<PersistedSlice>;
    return {
      theme: parsed.theme === 'light' ? 'light' : 'dark',
      sidebarOpen: parsed.sidebarOpen ?? true,
      autoPlayAudio: parsed.autoPlayAudio ?? true,
    };
  } catch {
    return { theme: 'dark', sidebarOpen: true, autoPlayAudio: true };
  }
}

function persist(slice: PersistedSlice): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slice));
  } catch {
    // Квота localStorage / приватный режим — тихо игнорируем.
  }
}

const initial = loadInitial();

export const useUiStore = create<UiState>((set) => ({
  theme: initial.theme,
  sidebarOpen: initial.sidebarOpen,
  autoPlayAudio: initial.autoPlayAudio,

  toggleTheme: () =>
    set((state) => {
      const theme: Theme = state.theme === 'dark' ? 'light' : 'dark';
      persist({ theme, sidebarOpen: state.sidebarOpen, autoPlayAudio: state.autoPlayAudio });
      return { theme };
    }),

  setSidebarOpen: (open) =>
    set((state) => {
      persist({ theme: state.theme, sidebarOpen: open, autoPlayAudio: state.autoPlayAudio });
      return { sidebarOpen: open };
    }),

  setAutoPlayAudio: (on) =>
    set((state) => {
      persist({ theme: state.theme, sidebarOpen: state.sidebarOpen, autoPlayAudio: on });
      return { autoPlayAudio: on };
    }),
}));
