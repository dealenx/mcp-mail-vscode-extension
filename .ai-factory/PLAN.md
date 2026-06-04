# Implementation Plan: Shared Mailbox Support (Yandex 360)

Branch: none (fast mode)
Created: 2026-06-04

## Settings

| Setting | Value |
|---|---|
| **Testing** | Yes — update existing tests |
| **Logging** | Verbose — DEBUG logs |
| **Docs** | No |

---

## Overview

Поддержка общих (shared) почтовых ящиков Яндекс 360. Ключевая проблема: для работы с общим ящиков нужны **разные** username для IMAP и SMTP, а также отдельный `fromAddress`:

```
IMAP username:  example.org/a.smith/support     (домен/пользователь/общий-ящик)
SMTP username:  a.smith@example.org             (обычный email)
FROM address:   support@example.org             (почта общего ящика)
```

**Обратная совместимость — критически важна:** все новые поля optional. Если пользователь не заполняет новые настройки, поведение идентично текущему.

```
imapUsername  → не задано → берём accountLogin (как сейчас)
smtpUsername  → не задано → берём accountLogin (как сейчас)
fromAddress   → не задано → берём smtpUsername (как сейчас)
```

---

## Tasks

### Phase 1: Core Types — добавить fromAddress в SMTPConfig

- [x] **Task 1: Добавить fromAddress в SMTPConfig и MailConfig во всех пакетах**
  - В `packages/core/src/types.ts`: добавить `fromAddress?: string` в `SMTPConfig`
  - В `packages/service/src/core/types.ts`: то же самое
  - В `packages/core/src/types.ts`: добавить `fromAddress` в `MailConfig.SMTP`
  - В `packages/service/src/core/types.ts`: то же самое
  - `fromAddress` — опциональное поле; если не задано, `SMTPClient` использует `username`

  LOGGING: N/A (type change only)

  Files: packages/core/src/types.ts, packages/service/src/core/types.ts

### Phase 2: VS Code Extension — настройки и config

- [x] **Task 2: Добавить новые настройки VS Code в package.json**
  - Добавить 3 новых свойства в `contributes.configuration.properties`:
    - `mcpMail.imapUsername` (string, default: "", description: "IMAP логин (если отличается от основного). Для Яндекс 360 с общим ящиком: домен/пользователь/имя-ящика. Если пусто — используется accountLogin")
    - `mcpMail.smtpUsername` (string, default: "", description: "SMTP логин (если отличается от основного). Если пусто — используется accountLogin")
    - `mcpMail.fromAddress` (string, default: "", description: "Email для заголовка From (если отличается от SMTP логина). Для общих ящиков — email общего ящика. Если пусто — используется smtpUsername или accountLogin")
  - Все 3 поля optional, с пустыми дефолтами — обратная совместимость гарантируется

  LOGGING: N/A (config only)

  Files: packages/vsix-extension/package.json

- [x] **Task 3: Обновить getMailConfig() в config.ts — fallback логика**
  - Обновить `MailConfig` интерфейс в `config.ts` — добавить `fromAddress` в `SMTP`
  - Обновить `getMailConfig()`:
    ```
    const imapUsername = cfg.get<string>('imapUsername') || user;
    const smtpUsername = cfg.get<string>('smtpUsername') || user;
    const fromAddress  = cfg.get<string>('fromAddress')  || smtpUsername;
    ```
  - `IMAP.username = imapUsername`
  - `SMTP.username = smtpUsername`
  - `SMTP.fromAddress = fromAddress`
  - Пароль остаётся общий (`accountPassword`) — Яндекс использует пароль приложения владельца

  LOGGING: `[Config]` префикс, DEBUG — логировать резолвнутые значения imapUsername, smtpUsername, fromAddress

  Files: packages/vsix-extension/src/mail/config.ts

### Phase 3: SMTP Client — передать fromAddress в письма

- [x] **Task 4: Обновить SMTPClient — использовать fromAddress в поле from**
  - Во всех 3 копиях SMTPClient (vsix, core, service):
    - Добавить `fromAddress` в конфиг (из `SMTPConfig`)
    - В `sendMail()`: `from: options.from || this.config.fromAddress || this.config.username`
    - Это гарантирует что при отправке письма `From:` будет правильным
  - Обратная совместимость: если `fromAddress` не задан → `from` = `username` (как сейчас)

  LOGGING: `[SMTP]` префикс, DEBUG — логировать итоговый `from` адрес при отправке

  Files:
  - packages/vsix-extension/src/mail/smtp-client.ts
  - packages/core/src/smtp-client.ts
  - packages/service/src/core/smtp-client.ts

### Phase 4: MailService — передавать fromAddress при отправке

- [x] **Task 5: Обновить MailService.sendEmail() — передавать from в EmailOptions**
  - В `mailService.ts` `sendEmail()`:
    - Считать `fromAddress` из `config.SMTP.fromAddress`
    - Передать `from: config.SMTP.fromAddress` в `emailOptions` (если задан)
  - В `mailService.ts` `replyToEmail()`:
    - То же самое — передать `from: config.SMTP.fromAddress`
  - В `mailService.ts` `buildRawEmailMessage()`:
    - Заменить `From: ${config.IMAP.username}` на `From: ${config.SMTP.fromAddress}` (использует fromAddress из SMTP конфига)
  - Возвращать `from: config.SMTP.fromAddress || config.SMTP.username` в результатах

  LOGGING: `[MailService]` префикс, INFO — логировать используемый from-адрес

  Files: packages/vsix-extension/src/mail/mailService.ts

### Phase 5: Remote Service — прокидка fromAddress

- [x] **Task 6: Обновить RemoteMailClient — передавать fromAddress при connect и send**
  - В `remote-client.ts` `connect()`:
    - Передать `fromAddress` в теле запроса `connect`:
      ```typescript
      smtp: {
        host: config.SMTP.host,
        port: config.SMTP.port,
        username: config.SMTP.username,
        password: config.SMTP.password,
        secure: config.SMTP.secure,
        fromAddress: config.SMTP.fromAddress, // НОВОЕ
      }
      ```
  - В `remote-client.ts` `sendEmail()`:
    - Передать `fromAddress` в теле запроса `send-email`

  LOGGING: `[RemoteClient]` префикс, DEBUG — логировать fromAddress при передаче

  Files: packages/vsix-extension/src/mail/remote-client.ts

- [x] **Task 7: Обновить Service connect route — принимать fromAddress**
  - В `packages/service/src/routes/connect.ts`:
    - Добавить `fromAddress` в `connectSchema` для SMTP (optional string)
    - Передать в `createSession()` → `session.smtpConfig.fromAddress`
  - В `packages/service/src/core/types.ts`: убедиться что `SMTPConfig` содержит `fromAddress`
  - В `packages/service/src/session-manager.ts`: `SessionConnections.smtpConfig` уже хранит `SMTPConfig`, новый字段 автоматически сохранится

  LOGGING: `[Connect]` префикс, DEBUG — логировать fromAddress при создании сессии

  Files: packages/service/src/routes/connect.ts, packages/service/src/core/types.ts

- [x] **Task 8: Обновить Service send-email и reply-email — использовать fromAddress**
  - В `send-email.ts`:
    - Заменить `from: session.smtpConfig.username` на `from: session.smtpConfig.fromAddress || session.smtpConfig.username`
    - В `buildRawEmailMessage`: передать `fromAddress` вместо `fromEmail` и использовать его в заголовке `From:`
  - В `reply-email.ts`:
    - То же самое — использовать `fromAddress || username` для `from`
  - В `reply-email.ts`: обновить фильтрацию `email !== session.imapConfig.username` — также учитывать `fromAddress`

  LOGGING: `[SendEmail]`, `[ReplyEmail]` — DEBUG логировать итоговый from-адрес

  Files: packages/service/src/routes/send-email.ts, packages/service/src/routes/reply-email.ts

### Phase 6: VS Code Sidebar — тестовое письмо с правильным from

- [x] **Task 9: Обновить sidebar тестовой отправки — использовать fromAddress**
  - В `mailSidebar.ts` строки 374 и 390: заменить `from: config.SMTP.username` на `from: config.SMTP.fromAddress || config.SMTP.username`
  - Это влияет на отправку тестового письма из sidebar

  LOGGING: `[Sidebar]` — DEBUG логировать from-адрес при тестовой отправке

  Files: packages/vsix-extension/src/mailSidebar.ts

### Phase 7: Тесты

- [x] **Task 10: Обновить тесты для проверки fromAddress и fallback**
  - В `packages/core/tests/types.test.ts`: добавить тесты для `SMTPConfig` с `fromAddress` и без
  - В `packages/service/tests/api.test.ts`: обновить connect-тест — передать `fromAddress` в SMTP конфиг
  - Добавить тест: connect без fromAddress → SMTP username используется как from
  - Добавить тест: connect с fromAddress → fromAddress используется как from
  - В `packages/vsix-extension/src/test/mail/smtpClient.test.ts`: добавить тесты для fromAddress в sendMail

  LOGGING: verbose в тестах

  Files: packages/core/tests/types.test.ts, packages/service/tests/api.test.ts, packages/vsix-extension/src/test/mail/smtpClient.test.ts

---

## Commit Plan

| Commit | Tasks | Message |
|---|---|---|
| **1** | 1–3 | `feat: add shared mailbox support — separate IMAP/SMTP username and fromAddress` |
| **2** | 4–5 | `feat: use fromAddress in SMTP sending and MailService` |
| **3** | 6–8 | `feat: propagate fromAddress through remote service and API` |
| **4** | 9 | `fix: use fromAddress in sidebar test email` |
| **5** | 10 | `test: add fromAddress and shared mailbox tests` |

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│  VS Code Settings (package.json)                                        │
│                                                                          │
│  mcpMail.accountLogin     → основной логин (обязательный)               │
│  mcpMail.accountPassword  → пароль приложения (обязательный)            │
│  mcpMail.imapUsername     → IMAP логин (optional, fallback=accountLogin)│
│  mcpMail.smtpUsername     → SMTP логин (optional, fallback=accountLogin)│
│  mcpMail.fromAddress      → From: email  (optional, fallback=smtpUsername)│
│                                                                          │
│  ┌─── Обычный ящик ──────────────────────────────────────────────────┐  │
│  │ accountLogin = "user@yandex.ru"                                   │  │
│  │ imapUsername  = ""  → fallback "user@yandex.ru"                    │  │
│  │ smtpUsername  = ""  → fallback "user@yandex.ru"                    │  │
│  │ fromAddress   = ""  → fallback "user@yandex.ru"                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─── Общий ящик (shared) ───────────────────────────────────────────┐  │
│  │ accountLogin   = "example.org/a.smith/support"                    │  │
│  │ imapUsername   = "example.org/a.smith/support" ← то же самое     │  │
│  │ smtpUsername   = "a.smith@example.org"        ← отличается!       │  │
│  │ fromAddress    = "support@example.org"         ← отличается!       │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  MailConfig (config.ts) — resolution logic                              │
│                                                                          │
│  IMAP.username  = imapUsername  || accountLogin                        │
│  SMTP.username   = smtpUsername  || accountLogin                        │
│  SMTP.fromAddress = fromAddress   || smtpUsername || accountLogin       │
│  IMAP.password  = accountPassword (общий)                               │
│  SMTP.password  = accountPassword (общий)                               │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  SMTPClient.sendMail() — from resolution                                │
│                                                                          │
│  mailOptions.from = options.from || config.fromAddress || config.username│
│                                                                          │
│  → если fromAddress задан — письмо придёт от общего ящика              │
│  → если не задан — от username (обратная совместимость)                │
└──────────────────────────────────────────────────────────────────────────┘
```

## Backward Compatibility Guarantee

Для пользователей, которые НЕ заполняют новые поля:

```
imapUsername  = ""  → resolve to accountLogin  → IMAP логин как раньше
smtpUsername  = ""  → resolve to accountLogin  → SMTP логин как раньше
fromAddress   = ""  → resolve to smtpUsername → resolves to accountLogin → From: как раньше
```

**Результат: нулевое изменение поведения для существующих конфигураций.**

## Яндекс 360 Shared Mailbox — Cheat Sheet

| Протокол | Поле            | Значение                               |
|----------|----------------|----------------------------------------|
| IMAP     | username       | `example.org/a.smith/support`          |
| IMAP     | password       | пароль приложения a.smith              |
| IMAP     | host           | `imap.yandex.ru`                       |
| IMAP     | port           | 993                                    |
| SMTP     | username       | `a.smith@example.org`                 |
| SMTP     | password       | пароль приложения a.smith (ТОТ ЖЕ!)  |
| SMTP     | host           | `smtp.yandex.ru`                       |
| SMTP     | port           | 465                                    |
| Email    | From:          | `support@example.org`                  |

## Next Steps

```
/aif-implement
```