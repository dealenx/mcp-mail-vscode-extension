# MCP Mail — Почта для VS Code Copilot

Расширение добавляет инструменты работы с почтой (IMAP/SMTP) в GitHub Copilot Chat через API `languageModelTools`. Позволяет читать, искать и отправлять письма прямо из чата с ИИ, а также проверять подключение через боковую панель.

## Возможности

- **Боковая панель** — проверка подключения, отправка тестового письма, настройки
- **Чтение почты** — список писем, поиск по отправителю/теме/тексту/дате
- **Отправка** — новые письма, ответы с вложениями
- **Вложения** — просмотр, скачивание, прикрепление к письму
- **Управление** — подключение/отключение, статусы, удаление писем

## Настройка

Откройте настройки VS Code (`Ctrl+,`) и найдите `MCP Mail`:

| Параметр | По умолчанию | Описание |
|---|---|---|
| `mcpMail.imapHost` | `imap.yandex.ru` | Адрес IMAP-сервера |
| `mcpMail.imapPort` | `993` | Порт IMAP-сервера |
| `mcpMail.imapSecure` | `true` | Использовать TLS для IMAP |
| `mcpMail.smtpHost` | `smtp.yandex.ru` | Адрес SMTP-сервера |
| `mcpMail.smtpPort` | `465` | Порт SMTP-сервера |
| `mcpMail.smtpSecure` | `true` | Использовать TLS для SMTP |
| `mcpMail.accountLogin` | — | Логин почты |
| `mcpMail.accountPassword` | — | Пароль почты |

> Для Яндекс почты используйте [пароль приложения](https://id.yandex.ru/security/app-passwords).

## Установка

1. Скачайте `.vsix` файл
2. В VS Code: `Ctrl+Shift+P` → `Extensions: Install from VSIX...`
3. Выберите файл

## Сборка

```bash
npm install
npm run compile
npm run package
```

## Использование с Copilot

После настройки в чате Copilot станут доступны команды:

```
@workspace подключись к почте
@workspace покажи непрочитанные письма
@workspace найди письма от boss@company.ru
@workspace отправь письмо на test@yandex.ru с темой "Отчёт"
```