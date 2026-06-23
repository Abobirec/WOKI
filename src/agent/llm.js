"use strict";

/**
 * Универсальный клиент чат-моделей.
 * Оба провайдера (NVIDIA build.nvidia.com и GitHub Models) совместимы с
 * форматом OpenAI Chat Completions, поэтому код общий — меняются только
 * базовый URL, модель и заголовок авторизации.
 */

const PROVIDERS = {
  nvidia: {
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    auth: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  github: {
    url: "https://models.github.ai/inference/chat/completions",
    auth: (key) => ({ Authorization: `Bearer ${key}` }),
  },
};

/**
 * Потоковый запрос к модели. Текст приходит кусками через onDelta,
 * вызовы инструментов аккумулируются и возвращаются в финальном message.
 *
 * @param {object} opts
 * @param {"nvidia"|"github"} opts.provider
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {Array} opts.messages
 * @param {Array} [opts.tools]
 * @param {number} [opts.temperature]
 * @param {(text:string)=>void} [opts.onDelta] — колбэк на каждый кусок текста
 * @param {AbortSignal} [opts.signal] — для отмены
 * @returns {Promise<{message: object, finishReason: string}>}
 */
async function chatStream({ provider, apiKey, model, messages, tools, temperature = 0.2, onDelta, signal }) {
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error(`Неизвестный провайдер: ${provider}`);
  if (!apiKey) throw new Error("Нет API-ключа. Открой ⚙ Настройки и сохрани ключ.");

  const body = { model, messages, temperature, stream: true };
  if (tools && tools.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cfg.auth(apiKey) },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ошибка API ${res.status}: ${text.slice(0, 500)}`);
  }

  // Аккумуляторы финального сообщения.
  let content = "";
  let finishReason = null;
  const toolCalls = []; // [{id, type, function:{name, arguments}}]

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop(); // последний кусок может быть неполным

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;

      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      const choice = json.choices && json.choices[0];
      if (!choice) continue;
      const delta = choice.delta || {};

      if (delta.content) {
        content += delta.content;
        onDelta && onDelta(delta.content);
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const i = tc.index || 0;
          if (!toolCalls[i]) {
            toolCalls[i] = { id: tc.id, type: "function", function: { name: "", arguments: "" } };
          }
          if (tc.id) toolCalls[i].id = tc.id;
          if (tc.function && tc.function.name) toolCalls[i].function.name += tc.function.name;
          if (tc.function && tc.function.arguments) toolCalls[i].function.arguments += tc.function.arguments;
        }
      }
    }
  }

  const message = { role: "assistant", content: content || null };
  const filledCalls = toolCalls.filter(Boolean);
  if (filledCalls.length) message.tool_calls = filledCalls;

  return { message, finishReason };
}

module.exports = { chatStream, PROVIDERS };
