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
function makeExecutors({ confirmEdit, confirmCommand, log }) {
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
  };
}

module.exports = { toolSchemas, makeExecutors };
