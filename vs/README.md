# WOKI для Visual Studio (большой, не VS Code)

ИИ агент-кодер прямо внутри Visual Studio: даёшь задачу — он сам читает и пишет
файлы в твоём решении. Работает через NVIDIA build.nvidia.com или GitHub Models.

> Это версия для **Visual Studio** (C#). Версия для **VS Code** — в корне репозитория.

## ⚙️ Что нужно один раз установить

Открой **Visual Studio Installer** → у своей Visual Studio нажми «Изменить» →
во вкладке «Рабочие нагрузки» поставь галочку **«Разработка расширений Visual Studio»**
(Visual Studio extension development) → «Изменить»/«Установить».

Без этого компонента проект не соберётся.

## ▶️ Как запустить

1. Открой файл **`vs/Woki.sln`** в Visual Studio.
2. Дождись, пока восстановятся пакеты NuGet (внизу строка состояния).
3. Нажми **F5** (или зелёную ▶ «Запустить»).
   - Откроется **вторая** Visual Studio с пометкой *Experimental Instance* —
     в ней WOKI уже встроен.
4. В этой второй Visual Studio открой любой свой проект/решение.
5. Меню **Вид → Другие окна → «WOKI — AI агент»** (View → Other Windows).
6. Нажми **⚙**, выбери провайдера, впиши модель и API-ключ → «Сохранить настройки».
7. Внизу напиши задачу и нажми Enter.

## 🔑 Бесплатные ключи

- **NVIDIA:** https://build.nvidia.com → выбери модель → «Get API Key».
- **GitHub Models:** https://github.com/settings/tokens → токен со scope `models:read`.

## 🔐 Безопасность ключей

Ключи хранятся в `%APPDATA%\WOKI\settings.json` и шифруются через **Windows DPAPI**
(привязка к твоей учётной записи Windows) — в открытом виде на диске их нет.

## Файлы проекта

| Файл | Назначение |
|---|---|
| `Woki/WokiPackage.cs` | точка входа, команда меню |
| `Woki/WokiToolWindow.cs` | окно-панель |
| `Woki/ui/WokiControl.xaml(.cs)` | интерфейс чата (WPF) |
| `Woki/agent/WokiAgent.cs` | цикл агента + вызовы модели |
| `Woki/agent/Tools.cs` | инструменты работы с файлами |
| `Woki/agent/WokiSettings.cs` | настройки и шифрование ключей |
| `Woki/agent/Prompts.cs` | системные промпты |

## Если при сборке ошибки

Пришли мне текст ошибок из вкладки **«Список ошибок»** — поправлю. Чаще всего
это версии NuGet-пакетов под твою Visual Studio.
