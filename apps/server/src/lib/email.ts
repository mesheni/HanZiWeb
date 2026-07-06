import nodemailer, { type Transporter } from 'nodemailer';
import { loadConfig } from '../config.js';

let transporter: Transporter | null = null;

/**
 * Класс ошибки конфигурации email. Роут ловит её и отвечает
 * `503 EMAIL_NOT_CONFIGURED` — фронт показывает общее сообщение
 * «Если аккаунт существует, письмо отправлено», а в логах сервера
 * остаётся явный сигнал, что SMTP не настроен.
 */
export class EmailNotConfiguredError extends Error {
  readonly code = 'EMAIL_NOT_CONFIGURED';
  readonly statusCode = 503;
  constructor(message = 'Email transport is not configured') {
    super(message);
    this.name = 'EmailNotConfiguredError';
  }
}

/**
 * Ленивая инициализация SMTP-транспорта.
 *
 * Конфигурация берётся из env (см. `loadConfig`). Если
 * `SMTP_HOST` / `SMTP_PORT` не заданы — бросаем
 * `EmailNotConfiguredError`, чтобы роут вернул 503.
 */
function getTransporter(): Transporter {
  if (transporter) return transporter;
  const config = loadConfig();
  if (!config.SMTP_HOST || !config.SMTP_PORT) {
    throw new EmailNotConfiguredError();
  }
  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth:
      config.SMTP_USER && config.SMTP_PASS
        ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
        : undefined,
  });
  return transporter;
}

/**
 * Закрывает SMTP-транспорт (используется в graceful shutdown).
 */
export async function closeEmailTransporter(): Promise<void> {
  if (transporter) {
    transporter.close();
    transporter = null;
  }
}

/**
 * Текст письма «сбросьте пароль». Чистый helper для unit-тестов:
 * можно проверить, что в письме есть ссылка с токеном и понятная
 * инструкция для пользователя.
 */
export function buildPasswordResetEmail(
  resetLink: string,
  ttlMinutes = 15,
): { subject: string; text: string; html: string } {
  const subject = 'Сброс пароля HanZi';
  const text =
    `Здравствуйте!\n\n` +
    `Мы получили запрос на сброс пароля для вашего аккаунта HanZi.\n` +
    `Если это были вы, перейдите по ссылке (она активна ${ttlMinutes} минут):\n\n` +
    `${resetLink}\n\n` +
    `Если вы не запрашивали сброс — просто проигнорируйте это письмо, ` +
    `ваш пароль останется прежним.`;
  const html =
    `<p>Здравствуйте!</p>` +
    `<p>Мы получили запрос на сброс пароля для вашего аккаунта HanZi.</p>` +
    `<p>Если это были вы, нажмите кнопку (ссылка активна ${ttlMinutes} минут):</p>` +
    `<p><a href="${resetLink}" style="display:inline-block;padding:12px 20px;` +
    `background:#4FC3F7;color:#0C0E16;text-decoration:none;border-radius:8px;` +
    `font-weight:600;">Сбросить пароль</a></p>` +
    `<p>Или скопируйте ссылку: <br><code>${resetLink}</code></p>` +
    `<p>Если вы не запрашивали сброс — просто проигнорируйте это письмо, ` +
    `ваш пароль останется прежним.</p>`;
  return { subject, text, html };
}

/**
 * Отправляет письмо со ссылкой на сброс пароля.
 *
 * Бросает `EmailNotConfiguredError`, если SMTP не настроен — роут
 * ловит его и отвечает 503 (но на этом этапе токен ещё не сохранён
 * в Redis, потому что отправка письма идёт ПОСЛЕ успешного `setex`).
 *
 * Если отправка неожиданно упала (сеть / SMTP вернул 5xx) — пробрасываем
 * ошибку дальше, чтобы роут залогировал и ответил 500.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
): Promise<void> {
  const config = loadConfig();
  const t = getTransporter();
  const { subject, text, html } = buildPasswordResetEmail(resetLink);
  await t.sendMail({
    from: config.SMTP_FROM,
    to,
    subject,
    text,
    html,
  });
}
