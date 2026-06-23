"use strict";

const { chatStream } = require("./llm");
const { toolSchemas, makeExecutors } = require("./tools");
const { buildSystemPrompt } = require("./prompts");

/**
 * Агентский цикл со стримингом, отменой, памятью проекта и секретами.
 */
class Agent {
  constructor({ getConfig, getApiKey, ui, os, workspace, history, secrets, loadMemory }) {
    this.getConfig = getConfig;
    this.getApiKey = getApiKey;
    this.ui = ui;
    this.secrets = secrets;
    this.loadMemory = loadMemory; // async () => string | null
    this.memoryInjected = false;

    this.messages = [{ role: "system", content: buildSystemPrompt({ workspace, os }) }];
    // Восстанавливаем историю проекта (память между перезапусками).
    if (history && history.length) this.messages.push(...history);

    this.executors = makeExecutors({
      confirmEdit: ui.confirmEdit,
      confirmCommand: ui.confirmCommand,
      log: ui.log,
      secrets,
    });
  }

  /** Прервать текущую генерацию. */
  cancel() {
    this.aborter && this.aborter.abort();
    this.cancelled = true;
  }

  /** Не-системные сообщения — для сохранения в память проекта. */
  exportHistory() {
    return this.messages.filter((m) => m.role !== "system");
  }

  async run(task) {
    this.cancelled = false;

    // Память проекта подмешиваем один раз за сессию, свежей.
    if (!this.memoryInjected && this.loadMemory) {
      const mem = await this.loadMemory();
      if (mem && mem.trim()) {
        this.messages.splice(1, 0, { role: "system", content: "Память проекта:\n" + mem.trim() });
      }
      this.memoryInjected = true;
    }

    this.messages.push({ role: "user", content: task });
    const cfg = this.getConfig();
    const apiKey = await this.getApiKey(cfg.provider);

    for (let step = 0; step < cfg.maxSteps; step++) {
      if (this.cancelled) {
        this.ui.assistant("⏹ Остановлено пользователем.");
        return;
      }

      this.aborter = new AbortController();
      let reply;
      let streamed = false;
      try {
        this.ui.beginAssistant();
        reply = await chatStream({
          provider: cfg.provider,
          apiKey,
          model: cfg.model,
          messages: this.messages,
          tools: toolSchemas,
          temperature: cfg.temperature,
          signal: this.aborter.signal,
          onDelta: (t) => {
            streamed = true;
            this.ui.assistantDelta(t);
          },
        });
      } catch (e) {
        if (this.cancelled || e.name === "AbortError") {
          this.ui.endAssistant();
          this.ui.assistant("⏹ Остановлено.");
          return;
        }
        this.ui.endAssistant();
        this.ui.log(`❌ ${e.message}`);
        this.ui.assistant(`Ошибка модели: ${e.message}`);
        return;
      }
      this.ui.endAssistant();

      const msg = reply.message;
      this.messages.push(msg);
      // Если текст не стримился (некоторые серверы), покажем разом.
      if (!streamed && msg.content && msg.content.trim()) this.ui.assistant(msg.content);

      const toolCalls = msg.tool_calls || [];
      if (!toolCalls.length) return; // модель закончила

      for (const call of toolCalls) {
        const name = call.function.name;
        let args = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          /* кривой JSON — вернём ошибку модели */
        }
        this.ui.log(`🔧 ${name}(${shortArgs(args)})`);

        let result;
        const exec = this.executors[name];
        if (!exec) result = `Неизвестный инструмент: ${name}`;
        else {
          try {
            result = await exec(args);
          } catch (e) {
            result = `Ошибка инструмента: ${e.message}`;
          }
        }
        this.messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: String(result).slice(0, 12000),
        });
      }
    }

    this.ui.assistant("Достигнут лимит шагов. Напиши «продолжай», чтобы довести задачу.");
  }
}

function shortArgs(args) {
  const s = JSON.stringify(args);
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
}

module.exports = { Agent };
