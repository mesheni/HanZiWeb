import { useState, useCallback } from 'react';
import { Loader2, KeyRound, Download } from 'lucide-react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Input from './ui/Input';
import { useToastStore } from '../stores/toastStore';
import { useSubscribeByCode } from '../queries/decks';

interface JoinDeckModalProps {
  open: boolean;
  onClose: () => void;
  onJoined?: () => void;
}

/**
 * Модал «Подписаться на колоду по коду».
 */
export default function JoinDeckModal({ open, onClose, onJoined }: JoinDeckModalProps) {
  const [code, setCode] = useState('');
  const addToast = useToastStore((s) => s.addToast);
  const subscribeMut = useSubscribeByCode();

  const handleSubmit = useCallback(async () => {
    const normalized = code.trim().toUpperCase();
    if (normalized.length < 4) {
      addToast('Введите корректный код', 'error');
      return;
    }
    try {
      const result = await subscribeMut.mutateAsync(normalized);
      addToast(
        `Колода «${result.deck.name}» добавлена (+${result.wordsAdded} новых слов)`,
        'success',
      );
      setCode('');
      onJoined?.();
      onClose();
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : 'Не удалось подписаться на колоду',
        'error',
      );
    }
  }, [code, subscribeMut, addToast, onJoined, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Подписаться на колоду">
      <div className="join-deck">
        <p className="join-deck-hint">
          Введите короткий код, который вам передал автор колоды.
        </p>
        <Input
          label="Код"
          placeholder="Например: K3D9P2"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={16}
          autoFocus
        />
        <div className="join-deck-actions">
          <Button variant="secondary" size="md" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => void handleSubmit()}
            loading={subscribeMut.isPending}
          >
            {subscribeMut.isPending ? <Loader2 size={13} className="spinner-inline" /> : <Download size={13} />}
            Подписаться
          </Button>
        </div>
        <div className="join-deck-icon">
          <KeyRound size={12} />
          <span>Код состоит из 4–16 заглавных латинских букв и цифр.</span>
        </div>
      </div>
    </Modal>
  );
}
