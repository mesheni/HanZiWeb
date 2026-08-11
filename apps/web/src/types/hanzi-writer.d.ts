declare module 'hanzi-writer' {
  interface HanziWriterOptions {
    width?: number;
    height?: number;
    padding?: number;
    strokeColor?: string;
    radicalColor?: string;
    outlineColor?: string;
    drawingColor?: string;
    highlightColor?: string;
    showCharacter?: boolean;
    showHintAfterMisses?: number;
    strokeAnimationSpeed?: number;
    delayBetweenStrokes?: number;
    delayBetweenLoops?: number;
    charDataLoader?: (char: string, onComplete: (data: unknown) => void) => void;
    onLoadCharDataSuccess?: () => void;
    onLoadCharDataError?: (error: unknown) => void;
  }

  interface QuizOptions {
    showCharacter?: boolean;
    showHintAfterMisses?: number;
    leniency?: number;
    highlightOnComplete?: boolean;
    highlightColor?: string;
    onCorrectStroke?: (strokeData: unknown) => void;
    onMistake?: (strokeData: unknown) => void;
    onComplete?: (summary: {
      character: string;
      totalMistakes: number;
      totalTime: number;
      strokeCount: number;
    }) => void;
  }

  interface WriterInstance {
    animateCharacter(options?: { onComplete?: () => void }): void;
    loopCharacterAnimation(): void;
    quiz(options?: Partial<QuizOptions>): void;
    cancelQuiz(): void;
    skipQuizStroke(): void;
    setCharacter(character: string): void;
  }

  function create(
    container: HTMLElement,
    character: string,
    options?: HanziWriterOptions,
  ): WriterInstance;

  const HanziWriter: {
    create: typeof create;
  };

  export default HanziWriter;
}
