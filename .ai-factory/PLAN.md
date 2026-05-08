# Plan — Локальное хранение отправленных писем и боковая панель

**Mode:** Fast  
**Date:** 2026-05-08  
**Plan file:** `.ai-factory/PLAN.md`

---

## Settings

| Параметр | Значение |
|---|---|
| **Testing** | ✅ Да — установить `mocha` + `@types/mocha`, написать unit-тесты для `SentMailHistoryService` |
| **Logging** | Verbose — логировать все операции сохранения, загрузки, обновления TreeView |
| **Docs** | ❌ Нет |

---

## Overview

Добавить локальное хранение каждого отправленного письма в `globalStorage/sent-emails/` (отдельный JSON на письмо). Переработать боковую панель MCP Mail: вместо статических кнопок показывать список отправленных писем (свежие сверху) с preview, получателем и относительной датой. По клику открывать WebviewPanel с полной детализацией письма в читаемом виде. Обновление списка — раз в 7 секунд.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     EXTENSION ACTIVATION                      │
├──────────────────────────────────────────────────────────────┤
│  extension.ts                                                 │
│   ├── mcpMailTreeView         (старая панель — оставить)      │
│   ├── mcpMailSentMailView     (НОВАЯ панель — список)         │
│   └── mcpMail.openSentMail    (команда → Webview)             │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  ИНТЕГРАЦИЯ ОТПРАВКИ                                         │
├──────────────────────────────────────────────────────────────┤
│  mailTools.ts                                                 │
│   MailSendEmailTool.call()                                    │
│     → mailService.sendEmail() → result                        │
│     → sentMailHistory.save(record)    ◄── НОВОЕ               │
│   MailReplyToEmailTool.call()                                │
│     → mailService.replyToEmail() → result                     │
│     → sentMailHistory.save(record)    ◄── НОВОЕ               │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  НОВЫЕ МОДУЛИ                                                │
├──────────────────────────────────────────────────────────────┤
│  src/sentMail/                                                │
│   ├── types.ts          → SentMailRecord                      │
│   ├── storage.ts        → пути, ensureDir                     │
│   ├── historyService.ts → save / loadAll / load               │
│   ├── sentMailTreeView.ts  → TreeDataProvider + автообновление│
│   └── sentMailDetailPanel.ts → WebviewPanel с HTML рендером  │
└──────────────────────────────────────────────────────────────┘
```

---

## Tasks

### [x] Task 1 — Модель и файловое хранилище

**Цель:** Определить типы и пути хранения.

- **Создать** `src/sentMail/types.ts`:
  - Интерфейс `SentMailRecord`:
    - `id: string` (имя файла без `.json`)
    - `to: string`
    - `subject: string`
    - `text?: string`
    - `html?: string`
    - `cc?: string`
    - `bcc?: string`
    - `attachments?: string[]` (имена файлов/путей)
    - `date: string` (ISO8601)
    - `messageId?: string`
- **Создать** `src/sentMail/storage.ts`:
  - `getSentMailStorageUri(context)` → `context.globalStorageUri/sent-emails/`
  - `ensureStorageDir(uri)` — создаёт директорию через `vscode.workspace.fs.createDirectory`
- **Логирование:** `info` при создании директории; `error` при ошибках.

**Файлы:** `src/sentMail/types.ts`, `src/sentMail/storage.ts`  
**Зависимости:** нет

---

### [x] Task 2 — HistoryService (CRUD)

**Цель:** Сервис для чтения/записи JSON-файлов писем.

- **Создать** `src/sentMail/historyService.ts` — класс `SentMailHistoryService`:
  - Конструктор принимает `storageUri: vscode.Uri`
  - `async save(record: SentMailRecord): Promise<void>`
    - Генерировать имя файла: `YYYY-MM-DD_HH-mm-ss_<random-hex>.json`
    - Записать JSON через `vscode.workspace.fs.writeFile`
  - `async loadAll(): Promise<SentMailRecord[]>`
    - Прочитать все файлы в `storageUri`
    - Отфильтровать только `.json`
    - Парсить каждый, сортировать по `date` **descending** (новые сверху)
  - `async load(id: string): Promise<SentMailRecord | null>`
    - Попытаться прочитать `<id>.json`
- **Логирование:** `info` при `save`/`loadAll`/`load` (количество записей, id); `error` при неудаче.

**Файлы:** `src/sentMail/historyService.ts`  
**Зависимости:** Task 1

---

### [x] Task 3 — Интеграция сохранения в mailTools

**Цель:** После каждой отправки/ответа сохранять копию в историю.

- **Модифицировать** `src/mailTools.ts`:
  - Импортировать `SentMailHistoryService` и `getSentMailStorageUri`
  - Создать singleton `sentMailHistory = new SentMailHistoryService(getSentMailStorageUri(...))` — где получить `ExtensionContext`?  
    ⚠️ **Решение:** `mailTools.ts` сейчас не имеет доступа к `context`. В `extension.ts` при активации создать `SentMailHistoryService` и передать его в `mailTools` (например, через setter или фабрику). Альтернативно — использовать `vscode.Uri.file(path.join(os.homedir(), '.mcp-mail-sent'))` как fallback, но лучше использовать `context.globalStorageUri`.
  - В `MailSendEmailTool.call()`: после `mailService.sendEmail()`, если успешно — вызвать `sentMailHistory.save({ id: ..., to: input.to, subject: input.subject, text: input.text, html: input.html, cc: input.cc, bcc: input.bcc, attachments: input.attachments, date: new Date().toISOString(), messageId: result.messageId })`
  - В `MailReplyToEmailTool.call()`: аналогично — сохранить reply (в subject добавить `Re: ...`, to = replyTo, etc.)
- **Логирование:** `info` при успешном сохранении; `error` если save упал.

**Файлы:** `src/mailTools.ts`  
**Зависимости:** Task 2

---

### [x] Task 4 — TreeView отправленных писем

**Цель:** Отображать список писем в боковой панели.

- **Создать** `src/sentMail/sentMailTreeView.ts`:
  - `SentMailTreeDataProvider implements vscode.TreeDataProvider<SentMailTreeItem>`:
    - `refresh()` — `fire()` event
    - `getChildren()`:
      - Вызвать `historyService.loadAll()`
      - Вернуть `SentMailTreeItem[]` для каждого письма
    - Каждые **7000 мс** вызывать `refresh()` через `setInterval`
    - `dispose()` — очищает интервал
  - `SentMailTreeItem extends vscode.TreeItem`:
    - `label` = `subject || "(без темы)"`
    - `description` = `"${to} • ${relativeTime(date)}"` (например, "test@mail.ru • 2 мин назад")
    - `tooltip` = первые 200 символов `text || html` (очистить HTML-теги если html)
    - `iconPath` = `new vscode.ThemeIcon('$(mail)')`
    - `command` = `{ command: 'mcpMail.openSentMail', arguments: [id] }`
  - Функция `relativeTime(isoDate)` — возвращает "только что", "5 мин назад", "вчера", "2 дня назад" и т.д.
- **Логирование:** `info` при каждом `refresh` (количество элементов); `error` при ошибке загрузки.

**Файлы:** `src/sentMail/sentMailTreeView.ts`  
**Зависимости:** Task 2

---

### [x] Task 5 — Регистрация панели в extension.ts и package.json

**Цель:** Подключить новый TreeView к VS Code.

- **Модифицировать** `package.json`:
  - В `views.mcpMailPanel` добавить:
    ```json
    {
      "id": "mcpMailSentMailView",
      "name": "Отправленные",
      "icon": "$(mail)"
    }
    ```
  - В `commands` добавить (внутренняя, не обязательно в палитре):
    ```json
    {
      "command": "mcpMail.openSentMail",
      "title": "Открыть отправленное письмо"
    }
    ```
- **Модифицировать** `src/extension.ts`:
  - Импортировать `SentMailTreeDataProvider` и `SentMailHistoryService`
  - Создать `const sentMailHistory = new SentMailHistoryService(getSentMailStorageUri(context))`
  - Создать `const sentMailProvider = new SentMailTreeDataProvider(sentMailHistory)`
  - Зарегистрировать TreeView:
    ```ts
    const sentMailTreeView = vscode.window.createTreeView('mcpMailSentMailView', {
      treeDataProvider: sentMailProvider,
      showCollapseAll: false,
    });
    context.subscriptions.push(sentMailTreeView);
    ```
  - Зарегистрировать команду `mcpMail.openSentMail`:
    - Получить `id` из аргументов
    - `const record = await sentMailHistory.load(id)`
    - Если найдено — открыть `SentMailDetailPanel.open(context, record)`
    - Если нет — `showWarningMessage`
  - Передать `sentMailHistory` в `mailTools` (например, через `setSentMailHistory(sentMailHistory)` или рефакторинг `mailTools.ts` на экспорт функции инициализации).  
    ⚠️ **Важно:** нужно решить, как `mailTools.ts` получит сервис. Вариант — экспортировать `let sentMailHistory: SentMailHistoryService | null = null` + `export function setSentMailHistory(s)`.
- **Логирование:** `info` при регистрации каждого компонента.

**Файлы:** `package.json`, `src/extension.ts`  
**Зависимости:** Task 3, Task 4

---

### Task 6 — WebviewPanel с детализацией письма

**Цель:** Красивый просмотр полного содержимого.

- **Создать** `src/sentMail/sentMailDetailPanel.ts`:
  - `SentMailDetailPanel` (или просто функция `openSentMailDetail`):
    - Создаёт `vscode.WebviewPanel` с `title = record.subject || "Отправленное письмо"`
    - Генерирует HTML:
      - CSS с использованием VS Code переменных (`--vscode-editor-foreground`, `--vscode-editor-background`, `--vscode-textBlockQuote-background`)
      - Блок метаданных:
        - **Кому:** `to`
        - **Копия:** `cc` (если есть)
        - **Скрытая копия:** `bcc` (если есть)
        - **Тема:** `subject`
        - **Дата:** `new Date(date).toLocaleString('ru-RU')`
      - Блок тела:
        - Если `html` — рендерить в `<div style="...">` (безопасно, так как это локальное содержимое пользователя)
        - Иначе `text` — в `<pre style="white-space: pre-wrap;">`
      - Если есть `attachments` — список имён файлов
    - Панель не reuse'able (или `viewColumn = One`), чтобы можно было открыть несколько писем.
- **Логирование:** `info` при открытии панели.

**Файлы:** `src/sentMail/sentMailDetailPanel.ts`  
**Зависимости:** Task 5

---

### Task 7 — Unit-тесты для HistoryService

**Цель:** Покрыть CRUD-логику сервиса.

- **Установить** dev-зависимости:
  - `mocha`, `@types/mocha` (уже есть `typescript`, `node` типы)
- **Добавить** в `package.json`:
  ```json
  "scripts": {
    "test": "mocha out/test/**/*.js"
  }
  ```
- **Создать** `src/test/sentMail/historyService.test.ts`:
  - Тестовая установка:
    - Создать временную директорию через `fs.mkdtempSync`
    - Создать `SentMailHistoryService` с `vscode.Uri.file(tempDir)`
  - Тесты:
    1. `save()` создаёт JSON-файл с корректным содержимым.
    2. `loadAll()` возвращает массив, отсортированный по `date` desc.
    3. `load(id)` возвращает конкретную запись.
    4. `load('nonexistent')` возвращает `null`.
    5. `save()` с несколькими записями — `loadAll()` возвращает все.
  - После каждого теста — очистка `fs.rmSync(tempDir, { recursive: true })`
- **Примечание:** тесты запускаются после `npm run compile` → `npm test`.  
  `vscode.Uri` доступен в Node-окружении без полноценного VS Code runtime, так как это простой класс.

**Файлы:** `src/test/sentMail/historyService.test.ts`  
**Зависимости:** Task 2

---

## Commit Plan

| Commit | Задачи | Сообщение |
|---|---|---|
| **1** | 1–3 | `feat(sent-mail): add SentMailHistoryService and integrate into send/reply tools` |
| **2** | 4–5 | `feat(sent-mail): add Sent Mail TreeView with auto-refresh` |
| **3** | 6 | `feat(sent-mail): add detail WebviewPanel for sent emails` |
| **4** | 7 | `test(sent-mail): add unit tests for SentMailHistoryService` |

---

## Next Steps

Чтобы начать реализацию:

```
/aif-implement
```

План содержит 7 задач, сгруппированных в 4 коммита. Перед `/aif-implement` рекомендуется `/clear` для освобождения контекста.
