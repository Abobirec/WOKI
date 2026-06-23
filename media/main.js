(function () {
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const log = $("log");
  const input = $("input");

  const MODELS = {
    nvidia: [
      "deepseek-ai/deepseek-v3",
      "qwen/qwen2.5-coder-32b-instruct",
      "meta/llama-3.3-70b-instruct",
      "nvidia/llama-3.1-nemotron-70b-instruct",
    ],
    github: [
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "openai/o1-mini",
      "meta/Llama-3.3-70B-Instruct",
      "mistral-ai/Mistral-Large-2411",
    ],
  };

  let state = {
    provider: "nvidia",
    models: { nvidia: MODELS.nvidia[0], github: MODELS.github[0] },
    temperature: 0.2,
    hasKey: { nvidia: false, github: false },
    projectSecrets: [],
  };

  let streamEl = null; // активный пузырь ответа при стриминге

  const thinking = document.createElement("div");
  thinking.id = "thinking";
  thinking.textContent = "WOKI думает…";
  log.after(thinking);

  function bubble(role) {
    const el = document.createElement("div");
    el.className = "msg " + role;
    if (role !== "log") {
      const r = document.createElement("div");
      r.className = "role";
      r.textContent = role === "user" ? "Ты" : "WOKI";
      el.appendChild(r);
    }
    const body = document.createElement("div");
    body.className = "body";
    el.appendChild(body);
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return body;
  }
  function add(role, text) {
    bubble(role).textContent = text;
    log.scrollTop = log.scrollHeight;
  }

  // --- Чат ---
  function submit() {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    $("stop").classList.remove("hidden");
    vscode.postMessage({ type: "ask", text });
  }
  $("send").addEventListener("click", submit);
  $("stop").addEventListener("click", () => vscode.postMessage({ type: "stop" }));
  $("reset").addEventListener("click", () => {
    log.innerHTML = "";
    vscode.postMessage({ type: "reset" });
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });

  // --- Настройки ---
  $("gear").addEventListener("click", () => $("settings").classList.toggle("hidden"));

  function fillModels() {
    const prov = $("provider").value;
    const sel = $("model");
    sel.innerHTML = "";
    MODELS[prov].forEach((m) => {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = m;
      sel.appendChild(o);
    });
    const current = state.models[prov];
    if (MODELS[prov].includes(current)) {
      sel.value = current;
      $("model-custom").value = "";
    } else if (current) {
      $("model-custom").value = current;
    }
  }
  $("provider").addEventListener("change", fillModels);
  $("temp").addEventListener("input", () => ($("temp-val").textContent = $("temp").value));

  $("nv-save").addEventListener("click", () => {
    const key = $("nv-key").value.trim();
    if (key) {
      vscode.postMessage({ type: "saveKey", provider: "nvidia", key });
      $("nv-key").value = "";
    }
  });
  $("gh-save").addEventListener("click", () => {
    const key = $("gh-key").value.trim();
    if (key) {
      vscode.postMessage({ type: "saveKey", provider: "github", key });
      $("gh-key").value = "";
    }
  });

  $("apply").addEventListener("click", () => {
    const provider = $("provider").value;
    const model = $("model-custom").value.trim() || $("model").value;
    const temperature = parseFloat($("temp").value);
    vscode.postMessage({ type: "saveConfig", provider, model, temperature });
  });

  // --- Секреты проекта ---
  $("sec-add").addEventListener("click", () => {
    const name = $("sec-name").value.trim();
    const value = $("sec-val").value;
    if (name && value) {
      vscode.postMessage({ type: "saveProjectSecret", name, value });
      $("sec-name").value = "";
      $("sec-val").value = "";
    }
  });

  function renderSecrets() {
    const ul = $("secret-list");
    ul.innerHTML = "";
    (state.projectSecrets || []).forEach((name) => {
      const li = document.createElement("li");
      li.textContent = name + " ";
      const del = document.createElement("button");
      del.className = "ghost tiny";
      del.textContent = "✕";
      del.addEventListener("click", () =>
        vscode.postMessage({ type: "deleteProjectSecret", name })
      );
      li.appendChild(del);
      ul.appendChild(li);
    });
  }

  function renderState() {
    $("provider").value = state.provider;
    fillModels();
    $("temp").value = state.temperature;
    $("temp-val").textContent = state.temperature;
    $("nv-saved").textContent = state.hasKey.nvidia ? "✓ сохранён" : "";
    $("gh-saved").textContent = state.hasKey.github ? "✓ сохранён" : "";
    $("status").textContent = `WOKI · ${state.provider} · ${state.models[state.provider]}`;
    renderSecrets();
  }

  // --- Приём сообщений ---
  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (msg.type === "user") add("user", msg.text);
    else if (msg.type === "assistant") add("assistant", msg.text);
    else if (msg.type === "log") add("log", msg.text);
    else if (msg.type === "thinking") {
      thinking.classList.toggle("on", msg.on);
      if (!msg.on) $("stop").classList.add("hidden");
    } else if (msg.type === "assistantBegin") {
      streamEl = null; // создадим лениво при первом дельте
    } else if (msg.type === "assistantDelta") {
      if (!streamEl) streamEl = bubble("assistant");
      streamEl.textContent += msg.text;
      log.scrollTop = log.scrollHeight;
    } else if (msg.type === "assistantEnd") {
      streamEl = null;
    } else if (msg.type === "state") {
      state = msg;
      renderState();
    }
  });

  vscode.postMessage({ type: "requestState" });
})();
