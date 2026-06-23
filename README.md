# WOKI — ИИ агент-кодер для VS Code

Дай задачу — агент сам думает, читает файлы и пишет код прямо в твоём проекте.
Как Cursor, только бесплатно через **NVIDIA build.nvidia.com** или **GitHub Models**.

## Как работает

```
Ты пишешь задачу в панели WOKI
        │
        ▼
  Агент (src/agent/agent.js) ──► Нейросеть (NVIDIA / GitHub Models)
        ▲                              │  возвращает вызовы инструментов
        │                              ▼
   результат ◄── инструменты: read_file, write_file, apply_edit,
                 list_files, run_command (src/agent/tools.js)
```

Цикл повторяется, пока модель не решит задачу. Все правки файлов
показываются с диффом и требуют подтверждения (можно отключить в настройках).

## Запуск за 3 шага

1. Открой эту папку в VS Code и нажми **F5** — откроется второе окно
   («Extension Development Host») с уже установленным WOKI.
2. В новом окне открой свой проект (File → Open Folder) и найди иконку **WOKI**
   на боковой панели слева.
3. Первый запрос попросит API-ключ. Получи бесплатный:
   - **NVIDIA:** https://build.nvidia.com → выбери модель → «Get API Key».
   - **GitHub Models:** https://github.com/settings/tokens → создай токен
     (classic со scope `models:read`, либо fine-grained с доступом к Models).

## Настройки (Settings → Extensions → WOKI)

| Настройка | Зачем |
|---|---|
| `woki.provider` | `nvidia` или `github` |
| `woki.nvidia.model` | напр. `deepseek-ai/deepseek-v3`, `qwen/qwen2.5-coder-32b-instruct` |
| `woki.github.model` | напр. `openai/gpt-4o` |
| `woki.temperature` | для кода держи 0.0–0.3 |
| `woki.maxSteps` | лимит шагов агента на задачу |
| `woki.autoApproveEdits` | применять правки без подтверждения |

## Структура

| Файл | Что делает |
|---|---|
| `src/extension.js` | точка входа, команды, хранение ключа |
| `src/ui/panel.js` | панель чата (webview) |
| `src/agent/agent.js` | цикл агента модель↔инструменты |
| `src/agent/llm.js` | клиент к NVIDIA / GitHub Models |
| `src/agent/tools.js` | инструменты работы с файлами |
| `src/agent/prompts.js` | системные промпты |

## Безопасность

- API-ключи хранятся в зашифрованном `SecretStorage` VS Code, не в коде.
- `run_command` всегда требует подтверждения.
- Правки файлов по умолчанию показываются диффом перед применением.
