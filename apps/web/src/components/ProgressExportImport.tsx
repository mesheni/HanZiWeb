import { useRef, useState, useCallback } from 'react';
import { Download, FileUp, FileJson, FileText, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ProgressExportSchema, type ProgressImportMode, type ProgressImportResponse } from '@hanzi/shared';
import { Button } from '@/components/ui';
import { toast } from '@/stores/toastStore';
import { downloadProgressExport, useImportProgress } from '@/queries/stats';

type Status =
  | { kind: 'idle' }
  | { kind: 'export-pending'; format: 'json' | 'csv' }
  | { kind: 'export-done' }
  | { kind: 'import-pending' }
  | { kind: 'import-done'; data: ProgressImportResponse }
  | { kind: 'error'; message: string };

/**
 * Карточка «Экспорт/импорт прогресса» в `SettingsScreen`.
 * Позволяет скачать JSON/CSV-бэкап `UserWordProgress` и загрузить
 * JSON-бэкап обратно. Реализует PLAN_Features_v0.2 §10.
 */
export default function ProgressExportImport() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [importMode, setImportMode] = useState<ProgressImportMode>('merge');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importProgress = useImportProgress();

  const handleExport = useCallback(async (format: 'json' | 'csv') => {
    setStatus({ kind: 'export-pending', format });
    try {
      await downloadProgressExport(format);
      setStatus({ kind: 'export-done' });
      toast(`Экспорт ${format.toUpperCase()} скачан`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось скачать файл';
      setStatus({ kind: 'error', message });
      toast(message, 'error');
    }
  }, []);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Сбрасываем значение, чтобы повторно выбрать тот же файл.
      event.target.value = '';
      if (!file) return;

      setStatus({ kind: 'import-pending' });
      try {
        const text = await file.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error('Файл не является валидным JSON');
        }

        // Полный ProgressExportSchema (с version/userId/exportedAt) или
        // просто объект `{ progress: [...] }` — оба варианта принимаем.
        const candidate =
          parsed && typeof parsed === 'object' && 'progress' in parsed
            ? (parsed as { progress: unknown })
            : { progress: Array.isArray(parsed) ? parsed : [] };

        const result = ProgressExportSchema.safeParse(candidate);
        if (!result.success) {
          const issue = result.error.errors[0];
          throw new Error(
            `Неверный формат файла: ${issue?.path.join('.') ?? '?'} — ${issue?.message ?? 'ошибка валидации'}`,
          );
        }

        const data = await importProgress.mutateAsync({
          mode: importMode,
          payload: result.data,
        });
        setStatus({ kind: 'import-done', data });
        toast(
          `Импорт выполнен: ${data.imported} добавлено, ${data.updated} обновлено, ${data.skipped} пропущено`,
          'success',
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Не удалось импортировать файл';
        setStatus({ kind: 'error', message });
        toast(message, 'error');
      }
    },
    [importMode, importProgress],
  );

  const isExporting =
    status.kind === 'export-pending';
  const isImporting =
    status.kind === 'import-pending' || importProgress.isPending;

  return (
    <section className="settings-card">
      <header className="settings-card-header">
        <div className="settings-card-header-meta">
          <div className="settings-card-icon bg-tone-2-bg text-tone-2">
            <Download size={18} />
          </div>
          <div className="settings-card-titles">
            <div className="settings-card-title">Экспорт и импорт прогресса</div>
            <div className="settings-card-description">
              Скачайте бэкап своих карточек (для переноса на другое устройство или аналитики)
              или восстановите прогресс из ранее сохранённого JSON-файла.
            </div>
          </div>
        </div>
      </header>

      <div className="settings-card-body">
        <div>
          <div className="settings-card-sublabel">Экспорт</div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={isExporting && status.kind === 'export-pending' && status.format === 'json'}
              onClick={() => handleExport('json')}
              disabled={isExporting || isImporting}
            >
              <FileJson size={16} />
              Скачать JSON
            </Button>
            <Button
              variant="secondary"
              loading={isExporting && status.kind === 'export-pending' && status.format === 'csv'}
              onClick={() => handleExport('csv')}
              disabled={isExporting || isImporting}
            >
              <FileText size={16} />
              Скачать CSV
            </Button>
          </div>
          <div className="text-xs text-text-dim mt-1">
            JSON содержит все поля и метаданные (рекомендуется для бэкапа). CSV — для Excel/аналитики.
          </div>
        </div>

        <div>
          <div className="settings-card-sublabel">Импорт</div>

          <div className="flex flex-wrap items-center gap-3 mb-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="import-mode"
                value="merge"
                checked={importMode === 'merge'}
                onChange={() => setImportMode('merge')}
                className="accent-accent"
              />
              <span>Слить с текущим</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="import-mode"
                value="replace"
                checked={importMode === 'replace'}
                onChange={() => setImportMode('replace')}
                className="accent-accent"
              />
              <span className="text-tone-4">Заменить весь прогресс</span>
            </label>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileSelected}
            style={{ display: 'none' }}
          />
          <div className="settings-card-body--right">
            <Button
              variant="secondary"
              loading={isImporting}
              onClick={handleImportClick}
              disabled={isExporting || isImporting}
            >
              {isImporting ? <Loader2 size={16} className="spinner-inline" /> : <FileUp size={16} />}
              Загрузить JSON
            </Button>
          </div>

          {importMode === 'replace' && (
            <div className="text-xs text-tone-4 mt-2 flex items-start gap-1">
              <AlertCircle size={12} className="shrink-0 mt-0.5" />
              <span>
                Текущий прогресс будет полностью удалён и заменён данными из файла.
              </span>
            </div>
          )}
        </div>

        {status.kind === 'import-done' && (
          <div className="import-result import-result-ok">
            <CheckCircle2 size={14} />
            <span>
              Импорт: добавлено {status.data.imported}, обновлено {status.data.updated},
              пропущено {status.data.skipped} (всего {status.data.total})
            </span>
          </div>
        )}
        {status.kind === 'error' && (
          <div className="import-result import-result-err">
            <AlertCircle size={14} />
            <span>{status.message}</span>
          </div>
        )}
      </div>
    </section>
  );
}
