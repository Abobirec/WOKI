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
    // GitHub Models. Можно также использовать токен через `Authorization`.
    url: "https://models.github.ai/inference/chat/completions",
    auth: (key) => ({ Authorization: `Bearer ${key}` }),
  },
};

/**
 * Один запрос к модели.
 * @param {object} opts
 * @param {"nvidia"|"github"} opts.provider
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {Array} opts.messages   — история в формате OpenAI
 * @param {Array} [opts.tools]    — описание инструментов (function calling)
 * @param {number} [opts.temperature]
 * @returns {Promise<{message: object}>}
 */
async function chat({ provider, apiKey, model, messages, tools, temperature = 0.2 }) {
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error(`Неизвестный провайдер: ${provider}`);
  if (!apiKey) throw new Error("Нет API-ключа. Запусти команду «WOKI: Задать API ключ».");

  const body = {
    model,
    messages,
    temperature,
    stream: false,
  };
  if (tools && tools.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...cfg.auth(apiKey),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ошибка API ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const choice = data.choices && data.choices[0];
  if (!choice) throw new Error("Пустой ответ модели: " + JSON.stringify(data).slice(0, 300));
  return { message: choice.message, finishReason: choice.finish_reason, usage: data.usage };
}

module.exports = { chat, PROVIDERS };
