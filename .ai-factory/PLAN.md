# Implementation Plan: Monorepo — core + service + vsix-extension

Branch: none (fast mode)
Created: 2026-05-28

## Settings

| Setting | Value |
|---|---|
| **Testing** | Yes — tests for core и service |
| **Logging** | Verbose — DEBUG logs везде |
| **Docs** | No |

---

## Overview

Реструктурировать проект в монорепо из 3 пакетов:

```
mcp-mail-vscode-extension/          ← root (workspaces)
├── packages/
│   ├── core/                        ← общие типы + IMAP/SMTP клиенты (0 vscode deps)
│   ├── service/                     ← REST API сервер на Bun + Hono (smtp-remote.mimikkai)
│   └── vsix-extension/              ← текущий VS Code extension (существующий src/)
├── package.json                     ← workspaces root
└── .ai-factory/
```

**Ключевая идея:** пользователь в VS Code переключает режим отправки:
- **local** — IMAP/SMTP соединения создаются прямо в расширении (как сейчас)
- **remote** — расширение делает HTTP-запросы к `packages/service`, передаёт конфиг, сервис создаёт соединение и выполняет операцию

**Service** — stateless-прокси: принял конфиг + данные → создал соединение → выполнил операцию → вернул результат → закрыл соединение. Без авторизации (пока).

**Bun** используется для:
- `packages/service` — сервер работает на Bun runtime
- `packages/core` — типы и клиенты, совместимы с Bun
- `packages/vsix-extension` — сборка через tsc (VS Code extension API не работает с Bun bundler), но зависимости ставятся через bun workspaces

---

## Tasks

### Phase 1: Monorepo Setup

- [x] **Task 1: Создать структуру директорий и корневой package.json**
  - Создать `packages/core/`, `packages/service/`, `packages/vsix-extension/`
  - Создать корневой `package.json` с `"workspaces": ["packages/*"]`
  - Перенести текущий `src/`, `package.json` (vsix-specific), `tsconfig.json`, `.vscodeignore`, `.vscode/` в `packages/vsix-extension/`
  - Перенести `examples/` можно удалить или оставить на root уровне
  - Обновить корневой `package.json` для bun workspaces
  - Проверить что `bun install` работает

  LOGGING: N/A (setup task)

  Files: package.json (root), packages/vsix-extension/package.json, packages/vsix-extension/tsconfig.json

- [x] **Task 2: Создать packages/core — общие типы и интерфейсы**
  - Создать `packages/core/package.json` (name: `@mcp-mail/core`)
  - Создать `packages/core/tsconfig.json`
  - Вынести из vsix-extension в core:
    - `src/mail/smtp-client.ts` → `packages/core/src/smtp-client.ts` (убрать vscode deps — их там нет)
    - `src/mail/imap-client.ts` → `packages/core/src/imap-client.ts` (убрать vscode deps — их там нет)
    - Создать `packages/core/src/types.ts` — общие интерфейсы: `IMAPConfig`, `SMTPConfig`, `MailConfig`, `EmailOptions`, `EmailResult`, `EmailMessage`, `AttachmentMeta`, `AttachmentData`, `SearchResult`, `SentMailRecord`
  - Создать `packages/core/src/index.ts` — реэкспорт всего
  - `SMTPConfig`, `IMAPConfig`, `EmailOptions`, `EmailResult` — вынести из smtp-client.ts в types.ts
  - `EmailMessage`, `AttachmentMeta`, `AttachmentData`, `MailboxInfo` — вынести из imap-client.ts в types.ts
  - Core НЕ зависит от vscode API

  LOGGING: `[SMTP]` и `[IMAP]` префиксы сохраняются, console.error для core

  Files: packages/core/package.json, packages/core/tsconfig.json, packages/core/src/types.ts, packages/core/src/smtp-client.ts, packages/core/src/imap-client.ts, packages/core/src/index.ts

### Phase 2: Service — REST API

- [x] **Task 3: Создать packages/service — REST API на Bun + Hono**
  - Создать `packages/service/package.json` (name: `@mcp-mail/service`)
  - Установить Hono ( Bun-compatible HTTP framework)
  - Зависимость: `"@mcp-mail/core": "workspace:*"`
  - Создать `packages/service/tsconfig.json`
  - Создать структуру:
    ```
    packages/service/src/
    ├── index.ts          ← Bun.serve() entry point
    ├── routes/
    │   ├── connect.ts    ← POST /api/connect     { imap, smtp } → { sessionId }
    │   ├── disconnect.ts ← POST /api/disconnect  { sessionId }
    │   ├── send-email.ts ← POST /api/send-email  { sessionId, to, subject, ... }
    │   ├── reply-email.ts← POST /api/reply-email { sessionId, originalUid, text, ... }
    │   ├── status.ts     ← GET  /api/status      { sessionId }
    │   ├── mailboxes.ts  ← POST /api/mailboxes   { sessionId }
    │   ├── search.ts     ← POST /api/search/*    { sessionId, criteria }
    │   ├── messages.ts   ← POST /api/messages    { sessionId, uid }
    │   └── attachments.ts← POST /api/attachments { sessionId, uid }
    ├── session-manager.ts ← управление соединениями (Map<sessionId, {imap, smtp}>)
    └── config.ts         ← типы конфигурации для API
    ```
  - Сессия: Stateless в смысле storage, но stateful в рамках запроса — соединение IMAP/SMTP создаётся при `/api/connect`, живёт в памяти service, закрывается при `/api/disconnect` или по таймауту (30 мин неактивности)
  - API schema для каждого эндпоинта — Zod валидация на входе
  - LOGGING: `[Service]` префикс, verbose на все операции, DEBUG на входящие запросы

  Files: packages/service/package.json, packages/service/tsconfig.json, packages/service/src/index.ts, packages/service/src/session-manager.ts, packages/service/src/config.ts, packages/service/src/routes/*.ts

### Phase 3: VSIX Extension — Remote Mode

- [x] **Task 4: Добавить настройку remote mode в vsix-extension**
  - Добавить в `package.json` → `contributes.configuration.properties`:
    - `mcpMail.sendMode`: enum `["local", "remote"]`, default `"local"`, description: "Режим отправки: локально (прямо через SMTP/IMAP) или удалённо (через сервис)"
    - `mcpMail.remoteUrl`: string, default `"https://smtp-remote.mimikkai"`, description: "URL удалённого сервиса"
  - Создать `packages/vsix-extension/src/mail/config.ts` — обновить `getMailConfig()` чтобы включать `sendMode` и `remoteUrl`

  LOGGING: `[Config]` префикс, DEBUG при чтении настроек

  Files: packages/vsix-extension/package.json, packages/vsix-extension/src/mail/config.ts

- [x] **Task 5: Создать RemoteMailClient в vsix-extension**
  - Создать `packages/vsix-extension/src/mail/remote-client.ts`
  - Класс `RemoteMailClient` — HTTP-клиент к service, реализующий тот же интерфейс что и `MailService`
  - Методы:
    - `connect(config)` → `POST /api/connect` → sessionId
    - `disconnect()` → `POST /api/disconnect`
    - `sendEmail(args, signal?)` → `POST /api/send-email`
    - `replyToEmail(args, signal?)` → `POST /api/reply-email`
    - `listMailboxes()` → `POST /api/mailboxes`
    - `searchBySender/Subject/Body/SinceDate/All(...)` → `POST /api/search/*`
    - `getMessages(uids)` → `POST /api/messages`
    - `getMessage(uid)` → `POST /api/messages/:uid`
    - `deleteMessage(uid)` → `POST /api/messages/:uid/delete`
    - `getAttachmentsMeta(uid)` → `POST /api/attachments/:uid`
    - `saveAttachment(uid, index?)` → `POST /api/attachments/:uid/save`
  - Хранит sessionId между вызовами
  - Error handling: если sessionId протух — реконнект автоматически
  - LOGGING: `[RemoteClient]` префикс, DEBUG на каждый HTTP-запрос/ответ

  Files: packages/vsix-extension/src/mail/remote-client.ts

- [x] **Task 6: Обновить MailService — режим local/remote switch**
  - Модифицировать `packages/vsix-extension/src/mail/mailService.ts`
  - Создать интерфейс `IMailService` с методами: `sendEmail`, `replyToEmail`, `listMailboxes`, `searchBySender/Subject/Body/SinceDate/All`, `getMessages`, `getMessage`, `deleteMessage`, `getAttachmentsMeta`, `saveAttachment`, `ensureIMAPConnection`, `ensureSMTPConnection`, `getConnectionStatus`, `disconnectAll`
  - `MailService` реализует `IMailService` (локальный режим, как сейчас)
  - `RemoteMailClient` реализует `IMailService` (удалённый режим)
  - Создать фабрику `createMailService(): IMailService` — читает `mcpMail.sendMode` из настроек, возвращает RemoteMailClient или MailService
  - В `mailTools.ts` использовать фабрику вместо `new MailService()`
  - Обработать переключение режима: при изменении настройки `sendMode` — пересоздать сервис
  - LOGGING: `[MailService]` префикс, INFO при переключении режима

  Files: packages/vsix-extension/src/mail/mailService.ts, packages/vsix-extension/src/mail/mailService.ts (interface), packages/vsix-extension/src/mailTools.ts, packages/vsix-extension/src/extension.ts

### Phase 4: Core — Tests

- [x] **Task 7: Тесты для packages/core**
  - Создать `packages/core/tests/smtp-client.test.ts`
  - Создать `packages/core/tests/imap-client.test.ts`
  - Создать `packages/core/tests/types.test.ts`
  - Использовать Bun test runner (`bun test`)
  - Тесты типов: валидация интерфейсов
  - Тесты SMTPClient: мок nodemailer, проверка connect/sendMail/disconnect
  - Тесты IMAPClient: мок imap, проверка connect/search/fetch/disconnect

  LOGGING: verbose в тестах

  Files: packages/core/tests/*.test.ts

- [x] **Task 8: Тесты для packages/service API**
  - Создать `packages/service/tests/` директорию
  - Использовать Bun test runner + Hono test helper
  - Тесты для каждого эндпоинта:
    - `connect.test.ts` — валидный конфиг → sessionId, невалидный → 400
    - `send-email.test.ts` — мок SMTP, проверка payload
    - `disconnect.test.ts` — корректное завершение сессии
    - `search.test.ts` — мок IMAP, проверка критериев
  - Интеграционный тест: connect → sendEmail → disconnect

  LOGGING: verbose в тестах

  Files: packages/service/tests/*.test.ts

### Phase 5: Wiring & Cleanup

- [x] **Task 9: Обновить imports и сборку vsix-extension**
  - Обновить все `import` в vsix-extension чтобы ссылаться на `@mcp-mail/core` вместо `./mail/imap-client` и `./mail/smtp-client`
  - Обновить `tsconfig.json` в vsix-extension для разрешения workspace-пакетов (paths или moduleResolution)
  - Проверить что `bun install` работает на root уровне
  - Проверить что `tsc -p packages/vsix-extension` компиливается
  - Проверить что `bun test` работает в core и service
  - Удалить дублирующиеся типы из vsix-extension/src/mail/ (smtp-client.ts и imap-client.ts — заменить на re-export из @mcp-mail/core или удалить)
  - LOGGING: N/A (wiring task)

  Files: packages/vsix-extension/tsconfig.json, packages/vsix-extension/src/mail/imap-client.ts (delete or re-export), packages/vsix-extension/src/mail/smtp-client.ts (delete or re-export), packages/vsix-extension/src/mail/mailService.ts

---

## Commit Plan

| Commit | Tasks | Message |
|---|---|---|
| **1** | 1–2 | `feat(mono): set up monorepo structure and extract core package` |
| **2** | 3 | `feat(service): add REST API service with Bun + Hono` |
| **3** | 4–6 | `feat(vsix): add remote/local send mode switch and remote client` |
| **4** | 7–8 | `test: add tests for core and service packages` |
| **5** | 9 | `refactor: update imports and clean up vsix-extension` |

---

## Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│  packages/core (@mcp-mail/core)                                    │
│  ├── types.ts        IMAPConfig, SMTPConfig, EmailOptions, ...    │
│  ├── smtp-client.ts  SMTPClient (nodemailer, 0 vscode deps)       │
│  ├── imap-client.ts  IMAPClient (imap lib, 0 vscode deps)         │
│  └── index.ts        re-exports                                    │
├────────────────────────────────────────────────────────────────────┤
│  packages/service (@mcp-mail/service)  [Bun + Hono]               │
│  ├── src/index.ts        Bun.serve({ port: 3000 })                │
│  ├── src/session-manager.ts   Map<sessionId, {imap,smtp}>         │
│  └── src/routes/                                                  │
│      ├── connect.ts      POST /api/connect                        │
│      ├── disconnect.ts   POST /api/disconnect                     │
│      ├── send-email.ts   POST /api/send-email                     │
│      ├── reply-email.ts  POST /api/reply-email                    │
│      ├── status.ts       GET  /api/status                         │
│      ├── mailboxes.ts    POST /api/mailboxes                      │
│      ├── search.ts       POST /api/search/*                       │
│      ├── messages.ts     POST /api/messages                       │
│      └── attachments.ts  POST /api/attachments                    │
├────────────────────────────────────────────────────────────────────┤
│  packages/vsix-extension (current src/)                           │
│  ├── src/mail/config.ts        reads mcpMail.* settings            │
│  ├── src/mail/remote-client.ts  HTTP client → service              │
│  ├── src/mail/mailService.ts   IMailService interface + local impl │
│  ├── src/mailTools.ts          Tool classes (use IMailService)     │
│  └── src/extension.ts          activate()                         │
└────────────────────────────────────────────────────────────────────┘

  User flow — LOCAL mode:
    vsix-extension → MailService → SMTPClient/IMAPClient → mail server

  User flow — REMOTE mode:
    vsix-extension → RemoteMailClient → HTTP → service → SMTPClient/IMAPClient → mail server
```

## Next Steps

```
/aif-implement
```