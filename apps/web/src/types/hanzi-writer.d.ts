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
    onLoadCharData?: () => void;
  }

  interface WriterInstance {
    animateCharacter(): void;
    loopCharacterAnimation(): void;
    quiz(options?: { showCharacter?: boolean; showHintAfterMisses?: number }): void;
    setCharacter(character: string): void;
  }

  function create(container: HTMLElement, character: string, options?: HanziWriterOptions): WriterInstance;

  const HanziWriter: {
    create: typeof create;
  };

  export default HanziWriter;
}
