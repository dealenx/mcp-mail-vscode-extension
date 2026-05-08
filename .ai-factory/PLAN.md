# Plan — Настройка подписи (signature) для отправляемых писем

**Mode:** Fast  
**Date:** 2026-05-08  
**Plan file:** `.ai-factory/PLAN.md`

---

## Settings

| Параметр | Значение |
|---|---|
| **Testing** | ❌ Нет (простая настройка, логика тривиальна) |
| **Logging** | Verbose — логировать когда подпись добавлена |
| **Docs** | ❌ Нет |

---

## Overview

Добавить 3 настройки в VS Code Settings для конфигурации email-подписи:
- `mcpMail.signatureText` — plain text подпись (textarea)
- `mcpMail.signatureHtml` — HTML подпись (textarea)
- `mcpMail.signatureEnabled` — включить/выключить (boolean, default true)

При отправке любого письма (sendEmail, replyToEmail, sendTestEmail):
- Если `signatureEnabled === true` и письмо содержит `text` + задан `signatureText` → добавить `\n\n---\n` + signatureText
- Если `signatureEnabled === true` и письмо содержит `html` + задан `signatureHtml` → добавить `<br><br><hr>` + signatureHtml
- Два поля независимы — если одно не задано, подпись для этого формата не добавляется

---

## Tasks

### [x] Task 1 — Добавить настройки в package.json
### [x] Task 2 — Helper для чтения подписи
### [x] Task 3 — Интеграция в MailService
### [x] Task 4 — Интеграция в mailSidebar (test email)
### [x] Task 5 — Команда открытия настроек подписи

- **Модифицировать** `src/mailSidebar.ts`:
  - Добавить новый `MailSidebarItem`:
    - label: "Настроить подпись"
    - commandId: `mcpMail.openSignatureSettings`
  - Зарегистрировать команду `mcpMail.openSignatureSettings`:
    - `vscode.commands.executeCommand('workbench.action.openSettings', 'mcpMail.signature')`
- **Модифицировать** `package.json`:
  - Добавить команду `mcpMail.openSignatureSettings` в `contributes.commands`

**Файлы:** `src/mailSidebar.ts`, `package.json`  
**Зависимости:** Task 1

---

## Commit Plan

| Commit | Задачи | Сообщение |
|---|---|---|
| **1** | 1–5 | `feat(signature): add configurable email signature with text and HTML support` |

---

## Next Steps

```
/aif-implement
```
