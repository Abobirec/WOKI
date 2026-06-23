(function () {
  const vscode = acquireVsCodeApi();
  const log = document.getElementById("log");
  const input = document.getElementById("input");
  const send = document.getElementById("send");
  const reset = document.getElementById("reset");

  // Индикатор "думает".
  const thinking = document.createElement("div");
  thinking.id = "thinking";
  thinking.textContent = "WOKI думает…";
  log.after(thinking);

  function add(role, text) {
    const el = document.createElement("div");
    el.className = "msg " + role;
    if (role !== "log") {
      const r = document.createElement("div");
      r.className = "role";
      r.textContent = role === "user" ? "Ты" : "WOKI";
      el.appendChild(r);
    }
    const body = document.createElement("div");
    body.textContent = text;
    el.appendChild(body);
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }

  function submit() {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    vscode.postMessage({ type: "ask", text });
  }

  send.addEventListener("click", submit);
  reset.addEventListener("click", () => {
    log.innerHTML = "";
    vscode.postMessage({ type: "reset" });
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });

  window.addEventListener("message", (e) => {
    const m = e.data;
    if (m.type === "user") add("user", m.text);
    else if (m.type === "assistant") add("assistant", m.text);
    else if (m.type === "log") add("log", m.text);
    else if (m.type === "thinking") thinking.classList.toggle("on", m.on);
  });
})();
