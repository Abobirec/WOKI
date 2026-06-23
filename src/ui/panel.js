"use strict";

const vscode = require("vscode");
const os = require("os");
const { Agent } = require("../agent/agent");

/**
 * Webview-панель чата в боковой панели VS Code.
 */
class ChatViewProvider {
  constructor(context) {
    this.context = context;
    this.agent = null;
  }

  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };
    view.webview.html = this.html(view.webview);

    view.webview.onDidReceiveMessage(async (m) => {
      if (m.type === "ask") {
        await this.handleTask(m.text);
      } else if (m.type === "reset") {
        this.agent = null;
        this.post({ type: "log", text: "🔄 Контекст сброшен." });
      } else if (m.type === "requestState") {
        await this.sendState();
      } else if (m.type === "saveKey") {
        await this.context.secrets.store(`woki.apiKey.${m.provider}`, (m.key || "").trim());
        this.post({ type: "log", text: `🔑 Ключ для «${m.provider}» сохранён.` });
        await this.sendState();
      } else if (m.type === "saveConfig") {
        const c = vscode.workspace.getConfiguration("woki");
        await c.update("provider", m.provider, vscode.ConfigurationTarget.Global);
        const modelKey = m.provider === "nvidia" ? "nvidia.model" : "github.model";
        await c.update(modelKey, m.model, vscode.ConfigurationTarget.Global);
        if (typeof m.temperature === "number") {
          await c.update("temperature", m.temperature, vscode.ConfigurationTarget.Global);
        }
        this.agent = null; // пересоздать с новыми настройками
        this.post({ type: "log", text: `⚙️ Провайдер: ${m.provider}, модель: ${m.model}.` });
        await this.sendState();
      }
    });

    this.sendState();
  }

  /** Отправляет в webview текущие настройки и факт наличия ключей (сами ключи не светим). */
  async sendState() {
    const c = vscode.workspace.getConfiguration("woki");
    const provider = c.get("provider");
    const nvKey = await this.context.secrets.get("woki.apiKey.nvidia");
    const ghKey = await this.context.secrets.get("woki.apiKey.github");
    this.post({
      type: "state",
      provider,
      models: { nvidia: c.get("nvidia.model"), github: c.get("github.model") },
      temperature: c.get("temperature"),
      hasKey: { nvidia: !!nvKey, github: !!ghKey },
    });
  }

  post(msg) {
    this.view && this.view.webview.postMessage(msg);
  }

  ensureAgent() {
    if (this.agent) return this.agent;
    const workspace =
      (vscode.workspace.workspaceFolders &&
        vscode.workspace.workspaceFolders[0].uri.fsPath) ||
      "(нет папки)";

    this.agent = new Agent({
      os: `${os.type()} ${os.release()}`,
      workspace,
      getConfig: () => {
        const c = vscode.workspace.getConfiguration("woki");
        const provider = c.get("provider");
        return {
          provider,
          model: c.get(provider === "nvidia" ? "nvidia.model" : "github.model"),
          temperature: c.get("temperature"),
          maxSteps: c.get("maxSteps"),
          autoApprove: c.get("autoApproveEdits"),
        };
      },
      getApiKey: async (provider) => {
        const keyName = `woki.apiKey.${provider}`;
        let key = await this.context.secrets.get(keyName);
        if (!key) {
          key = await vscode.commands.executeCommand("woki.setApiKey", provider);
        }
        return key;
      },
      ui: {
        log: (t) => this.post({ type: "log", text: t }),
        assistant: (t) => this.post({ type: "assistant", text: t }),
        confirmEdit: async (path, oldText, newText) => {
          const cfg = vscode.workspace.getConfiguration("woki");
          if (cfg.get("autoApproveEdits")) return true;
          const choice = await vscode.window.showInformationMessage(
            `WOKI хочет изменить файл: ${path}`,
            { modal: false },
            "Применить",
            "Показать дифф",
            "Отклонить"
          );
          if (choice === "Показать дифф") {
            await showDiff(path, oldText, newText);
            const c2 = await vscode.window.showInformationMessage(
              `Применить изменения в ${path}?`,
              "Применить",
              "Отклонить"
            );
            return c2 === "Применить";
          }
          return choice === "Применить";
        },
        confirmCommand: async (command) => {
          const choice = await vscode.window.showWarningMessage(
            `WOKI хочет выполнить команду:\n${command}`,
            { modal: true },
            "Выполнить"
          );
          return choice === "Выполнить";
        },
      },
    });
    return this.agent;
  }

  async handleTask(text) {
    if (!text || !text.trim()) return;
    this.post({ type: "user", text });
    this.post({ type: "thinking", on: true });
    try {
      const agent = this.ensureAgent();
      await agent.run(text);
    } catch (e) {
      this.post({ type: "log", text: `❌ ${e.message}` });
    } finally {
      this.post({ type: "thinking", on: false });
    }
  }

  html(webview) {
    const nonce = String(Math.random()).slice(2);
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "style.css")
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "main.js")
    );
    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link href="${styleUri}" rel="stylesheet">
</head>
<body>
  <div id="topbar">
    <span id="status">WOKI</span>
    <button id="gear" class="ghost" title="Настройки">⚙</button>
  </div>

  <div id="settings" class="hidden">
    <div class="field">
      <label>Провайдер</label>
      <select id="provider">
        <option value="nvidia">NVIDIA (build.nvidia.com)</option>
        <option value="github">GitHub Models</option>
      </select>
    </div>

    <div class="field">
      <label>Ключ NVIDIA <span id="nv-saved" class="badge"></span></label>
      <div class="row">
        <input id="nv-key" type="password" placeholder="nvapi-…">
        <button id="nv-save" class="ghost">Сохранить</button>
      </div>
    </div>

    <div class="field">
      <label>GitHub токен <span id="gh-saved" class="badge"></span></label>
      <div class="row">
        <input id="gh-key" type="password" placeholder="ghp_…">
        <button id="gh-save" class="ghost">Сохранить</button>
      </div>
    </div>

    <div class="field">
      <label>Модель</label>
      <select id="model"></select>
      <input id="model-custom" placeholder="или впиши свою модель" />
    </div>

    <div class="field">
      <label>Temperature: <span id="temp-val">0.2</span></label>
      <input id="temp" type="range" min="0" max="1" step="0.05" value="0.2">
    </div>

    <button id="apply">Сохранить настройки</button>
  </div>

  <div id="log"></div>
  <div id="bar">
    <textarea id="input" rows="2" placeholder="Опиши задачу… (Enter — отправить)"></textarea>
    <div class="row">
      <button id="send">Отправить</button>
      <button id="reset" class="ghost">Сброс</button>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

async function showDiff(path, oldText, newText) {
  const left = await vscode.workspace.openTextDocument({ content: oldText, language: "plaintext" });
  const right = await vscode.workspace.openTextDocument({ content: newText, language: "plaintext" });
  await vscode.commands.executeCommand("vscode.diff", left.uri, right.uri, `WOKI: ${path} (было ↔ станет)`);
}

module.exports = { ChatViewProvider };
