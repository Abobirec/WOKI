"use strict";

const { chat } = require("./llm");
const { toolSchemas, makeExecutors } = require("./tools");
const { buildSystemPrompt } = require("./prompts");

/**
 * Агентский цикл. Поддерживает историю диалога между запросами,
 * чтобы агент «помнил» предыдущие задачи в рамках сессии.
 */
class Agent {
  constructor({ getConfig, getApiKey, ui, os, workspace }) {
    this.getConfig = getConfig;
    this.getApiKey = getApiKey;
    this.ui = ui; // { log, assistant, confirmEdit, confirmCommand }
    this.messages = [{ role: "system", content: buildSystemPrompt({ workspace, os }) }];
    this.executors = makeExecutors({
      confirmEdit: ui.confirmEdit,
      confirmCommand: ui.confirmCommand,
      log: ui.log,
    });
  }

  /** Запустить выполнение задачи пользователя. */
  async run(task) {
    this.messages.push({ role: "user", content: task });
    const cfg = this.getConfig();
    const apiKey = await this.getApiKey(cfg.provider);

    for (let step = 0; step < cfg.maxSteps; step++) {
      let reply;
      try {
        reply = await chat({
          provider: cfg.provider,
          apiKey,
          model: cfg.model,
          messages: this.messages,
          tools: toolSchemas,
          temperature: cfg.temperature,
        });
      } catch (e) {
        this.ui.log(`❌ ${e.message}`);
        this.ui.assistant(`Ошибка обращения к модели: ${e.message}`);
        return;
      }

      const msg = reply.message;
      this.messages.push(msg);

      const toolCalls = msg.tool_calls || [];
      // Если модель что-то написала пользователю — показываем.
      if (msg.content && msg.content.trim()) {
        this.ui.assistant(msg.content);
      }

      // Нет вызовов инструментов — значит модель закончила.
      if (!toolCalls.length) return;

      // Выполняем все запрошенные инструменты и возвращаем результаты модели.
      for (const call of toolCalls) {
        const name = call.function.name;
        let args = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          /* кривой JSON от модели — отдадим ошибку обратно */
        }
        this.ui.log(`🔧 ${name}(${shortArgs(args)})`);

        let result;
        const exec = this.executors[name];
        if (!exec) {
          result = `Неизвестный инструмент: ${name}`;
        } else {
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

    this.ui.assistant(
      "Достигнут лимит шагов. Напиши «продолжай», если нужно довести задачу до конца."
    );
  }
}

function shortArgs(args) {
  const s = JSON.stringify(args);
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
}

module.exports = { Agent };
