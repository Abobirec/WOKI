"use strict";

const vscode = require("vscode");
const { ChatViewProvider } = require("./ui/panel");

function activate(context) {
  const provider = new ChatViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("woki.chat", provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("woki.openChat", () => {
      vscode.commands.executeCommand("woki.chat.focus");
    })
  );

  // Сохранение API-ключа в безопасное хранилище VS Code (SecretStorage).
  context.subscriptions.push(
    vscode.commands.registerCommand("woki.setApiKey", async (providerArg) => {
      const cfg = vscode.workspace.getConfiguration("woki");
      const prov = providerArg || cfg.get("provider");
      const label =
        prov === "nvidia"
          ? "API-ключ NVIDIA (build.nvidia.com)"
          : "GitHub-токен для GitHub Models";
      const key = await vscode.window.showInputBox({
        title: `WOKI — ${label}`,
        prompt: `Вставь ${label}`,
        password: true,
        ignoreFocusOut: true,
      });
      if (key) {
        await context.secrets.store(`woki.apiKey.${prov}`, key.trim());
        vscode.window.showInformationMessage(`WOKI: ключ для «${prov}» сохранён.`);
        return key.trim();
      }
      return undefined;
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
