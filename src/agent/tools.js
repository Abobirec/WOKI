"use strict";

const vscode = require("vscode");
const path = require("path");
const cp = require("child_process");

/**
 * Описание инструментов для модели (OpenAI function-calling формат).
 * Чёткие описания = модель реже ошибается с выбором инструмента.
 */
const toolSchemas = [
  {
    type: "function",
    function: {
      name: "list_files",
      description:
        "Показать дерево файлов проекта (или поддиректории). Используй в начале, чтобы понять структуру.",
      parameters: {
        type: "object",
        properties: {
          dir: { type: "string", description: "Относительный путь от корня проекта. Пусто = корень." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Прочитать содержимое файла. ВСЕГДА читай файл перед его изменением.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Относительный путь к файлу от корня проекта." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Создать новый файл или ПОЛНОСТЬЮ перезаписать существующий. Передавай полное итоговое содержимое файла.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Относительный путь к файлу." },
          content: { type: "string", description: "Полное содержимое файла." },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_edit",
      description:
        "Точечно заменить кусок текста в файле. find должен встречаться РОВНО один раз. Предпочитай этот инструмент для маленьких правок.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Относительный путь к файлу." },
          find: { type: "string", description: "Точный фрагмент текста, который надо заменить (уникальный)." },
          replace: { type: "string", description: "На что заменить." },
        },
        required: ["path", "find", "replace"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Выполнить shell-команду в корне проекта (тесты, сборка, установка). Требует подтверждения пользователя.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Команда для выполнения." },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_active_editor",
      description: "Получить путь и содержимое файла, открытого сейчас в редакторе, и выделенный фрагмент (если есть).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "remember",
      description:
        "Сохранить важную заметку в долговременную память проекта (.woki/memory.md), чтобы помнить её в будущих сессиях.",
      parameters: {
        type: "object",
        properties: {
          note: { type: "string", description: "Короткий факт о проекте, который стоит запомнить." },
        },
        required: ["note"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_secrets",
      description: "Показать ИМЕНА сохранённых API-ключей проекта (без значений).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "save_secret_to_env",
      description:
        "Безопасно записать значение сохранённого секрета в файл вида KEY=value (например .env). Значение НЕ проходит через модель.",
      parameters: {
        type: "object",
        properties: {
          secret: { type: "string", description: "Имя секрета из list_secrets." },
          file: { type: "string", description: "Файл назначения, напр. .env" },
          var: { type: "string", description: "Имя переменной окружения, напр. OPENAI_API_KEY" },
        },
        required: ["secret", "file", "var"],
      },
    },
  },
];

function workspaceRoot() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || !folders.length) throw new Error("Открой папку проекта в VS Code.");
  return folders[0].uri;
}

function resolve(rel) {
  const root = workspaceRoot();
  return vscode.Uri.joinPath(root, rel || "");
}

/**
 * Исполнители инструментов. Каждый возвращает строку — результат для модели.
 * onEdit(path, oldText, newText) вызывается перед записью для подтверждения/диффа.
 */
function makeExecutors({ confirmEdit, confirmCommand, log, secrets }) {
  async function readFileSafe(uri) {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(bytes).toString("utf8");
    } catch {
      return null;
    }
  }

  return {
    async list_files(args) {
      const dir = resolve(args.dir || "");
      const entries = await vscode.workspace.fs.readDirectory(dir);
      const lines = entries
        .filter(([name]) => !name.startsWith(".git") && name !== "node_modules")
        .map(([name, type]) => (type === vscode.FileType.Directory ? name + "/" : name));
      return lines.join("\n") || "(пусто)";
    },

    async read_file(args) {
      const uri = resolve(args.path);
      const content = await readFileSafe(uri);
      if (content === null) return `Файл не найден: ${args.path}`;
      return content;
    },

    async write_file(args) {
      const uri = resolve(args.path);
      const old = (await readFileSafe(uri)) ?? "";
      const ok = await confirmEdit(args.path, old, args.content);
      if (!ok) return "Пользователь отклонил изменение файла.";
      // Создаём директории при необходимости.
      const dir = vscode.Uri.joinPath(uri, "..");
      await vscode.workspace.fs.createDirectory(dir).catch(() => {});
      await vscode.workspace.fs.writeFile(uri, Buffer.from(args.content, "utf8"));
      log(`✍️  Записан ${args.path}`);
      return `Файл сохранён: ${args.path}`;
    },

    async apply_edit(args) {
      const uri = resolve(args.path);
      const old = await readFileSafe(uri);
      if (old === null) return `Файл не найден: ${args.path}`;
      const count = old.split(args.find).length - 1;
      if (count === 0) return `Фрагмент не найден в ${args.path}. Прочитай файл и уточни find.`;
      if (count > 1) return `Фрагмент встречается ${count} раз — сделай find уникальнее.`;
      const next = old.replace(args.find, args.replace);
      const ok = await confirmEdit(args.path, old, next);
      if (!ok) return "Пользователь отклонил изменение файла.";
      await vscode.workspace.fs.writeFile(uri, Buffer.from(next, "utf8"));
      log(`✏️  Правка ${args.path}`);
      return `Правка применена: ${args.path}`;
    },

    async run_command(args) {
      const ok = await confirmCommand(args.command);
      if (!ok) return "Пользователь отклонил выполнение команды.";
      const cwd = workspaceRoot().fsPath;
      log(`▶️  ${args.command}`);
      return await new Promise((res) => {
        cp.exec(args.command, { cwd, timeout: 120000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
          const out = (stdout || "") + (stderr || "");
          if (err && !out) res(`Ошибка: ${err.message}`);
          else res(out.slice(0, 8000) || "(нет вывода, код 0)");
        });
      });
    },

    async read_active_editor() {
      const ed = vscode.window.activeTextEditor;
      if (!ed) return "Сейчас нет открытого файла в редакторе.";
      const root = workspaceRoot().fsPath;
      const full = ed.document.uri.fsPath;
      const rel = full.startsWith(root) ? full.slice(root.length + 1) : full;
      const sel = ed.selection && !ed.selection.isEmpty ? ed.document.getText(ed.selection) : "";
      const text = ed.document.getText();
      return (
        `Открытый файл: ${rel}\n` +
        (sel ? `Выделение:\n${sel}\n---\n` : "") +
        `Содержимое:\n${text.slice(0, 12000)}`
      );
    },

    async remember(args) {
      const uri = resolve(".woki/memory.md");
      const prev = (await readFileSafe(uri)) ?? "# Память проекта WOKI\n";
      const stamp = new Date().toISOString().slice(0, 10);
      const next = prev.replace(/\s*$/, "") + `\n- (${stamp}) ${args.note}\n`;
      await vscode.workspace.fs.createDirectory(resolve(".woki")).catch(() => {});
      await vscode.workspace.fs.writeFile(uri, Buffer.from(next, "utf8"));
      log(`🧠 Запомнил: ${args.note}`);
      return "Сохранено в память проекта.";
    },

    async list_secrets() {
      if (!secrets) return "Хранилище секретов недоступно.";
      const names = await secrets.list();
      return names.length ? "Доступные секреты: " + names.join(", ") : "Секретов пока нет.";
    },

    async save_secret_to_env(args) {
      if (!secrets) return "Хранилище секретов недоступно.";
      const value = await secrets.get(args.secret);
      if (value === undefined) return `Секрет «${args.secret}» не найден. Проверь list_secrets.`;
      const uri = resolve(args.file);
      const prev = (await readFileSafe(uri)) ?? "";
      const line = `${args.var}=${value}`;
      const re = new RegExp(`^${args.var}=.*$`, "m");
      const next = re.test(prev) ? prev.replace(re, line) : prev.replace(/\s*$/, "") + `\n${line}\n`;
      const ok = await confirmEdit(args.file, prev, next.replace(value, "***"));
      if (!ok) return "Пользователь отклонил запись секрета.";
      await vscode.workspace.fs.writeFile(uri, Buffer.from(next, "utf8"));
      log(`🔐 Секрет «${args.secret}» записан в ${args.file} как ${args.var}`);
      return `Готово: ${args.var} записан в ${args.file} (значение не раскрыто).`;
    },
  };
}

module.exports = { toolSchemas, makeExecutors };
