import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Button from './Button';

// F30: первый DOM-тест — доказывает, что jsdom-окружение работает
// (раньше тестов с рендером компонентов не было вовсе).

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function render(ui: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(ui));
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null;
  root = null;
});

describe('Button (DOM, F30)', () => {
  it('рендерит текст и вызывает onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Сохранить</Button>);

    const btn = document.querySelector('button');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe('Сохранить');

    act(() => btn!.click());
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('disabled при loading=true', () => {
    render(<Button loading>Ждём</Button>);
    const btn = document.querySelector('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
