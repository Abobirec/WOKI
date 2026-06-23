using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Microsoft.VisualStudio.Shell;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Woki.Agent
{
    /// <summary>
    /// Агент: получает задачу, общается с моделью (NVIDIA / GitHub Models)
    /// и сам читает/пишет файлы в открытом решении через инструменты.
    /// </summary>
    public class WokiAgent
    {
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromMinutes(3) };

        private readonly Func<WokiSettings> _getSettings;
        private readonly Action<string, string> _onMessage; // (role, text)
        private const int MaxSteps = 25;

        static WokiAgent()
        {
            System.Net.ServicePointManager.SecurityProtocol |= System.Net.SecurityProtocolType.Tls12;
        }

        public WokiAgent(Func<WokiSettings> getSettings, Action<string, string> onMessage)
        {
            _getSettings = getSettings;
            _onMessage = onMessage;
        }

        private static string Endpoint(string provider) =>
            provider == "github"
                ? "https://models.github.ai/inference/chat/completions"
                : "https://integrate.api.nvidia.com/v1/chat/completions";

        public async Task RunAsync(string task)
        {
            var s = _getSettings();
            string apiKey = s.GetKey(s.Provider);
            if (string.IsNullOrEmpty(apiKey))
            {
                _onMessage("ошибка", "Нет API-ключа. Нажми ⚙ и сохрани ключ.");
                return;
            }

            string root = GetSolutionRoot();
            if (root == null)
            {
                _onMessage("ошибка", "Открой решение или папку — агенту нужен проект для работы.");
                return;
            }

            var messages = new JArray
            {
                new JObject { ["role"] = "system", ["content"] = Prompts.System(root) },
                new JObject { ["role"] = "user", ["content"] = task }
            };

            for (int step = 0; step < MaxSteps; step++)
            {
                JObject assistant;
                try
                {
                    assistant = await CallModelAsync(s, apiKey, messages);
                }
                catch (Exception ex)
                {
                    _onMessage("ошибка", "Модель: " + ex.Message);
                    return;
                }

                messages.Add(assistant);

                string content = assistant["content"]?.ToString();
                if (!string.IsNullOrWhiteSpace(content))
                    _onMessage("WOKI", content);

                var toolCalls = assistant["tool_calls"] as JArray;
                if (toolCalls == null || toolCalls.Count == 0)
                    return; // модель закончила

                foreach (var call in toolCalls)
                {
                    string name = call["function"]?["name"]?.ToString() ?? "";
                    string argsJson = call["function"]?["arguments"]?.ToString() ?? "{}";
                    string id = call["id"]?.ToString();

                    _onMessage("инструмент", name);
                    string result = ExecuteTool(root, name, argsJson);

                    messages.Add(new JObject
                    {
                        ["role"] = "tool",
                        ["tool_call_id"] = id,
                        ["content"] = result
                    });
                }
            }

            _onMessage("WOKI", "Достигнут лимит шагов. Напиши «продолжай», чтобы доделать.");
        }

        private async Task<JObject> CallModelAsync(WokiSettings s, string apiKey, JArray messages)
        {
            var body = new JObject
            {
                ["model"] = s.Model,
                ["messages"] = messages,
                ["temperature"] = 0.2,
                ["tools"] = Tools.Schemas(),
                ["tool_choice"] = "auto"
            };

            using (var req = new HttpRequestMessage(HttpMethod.Post, Endpoint(s.Provider)))
            {
                req.Headers.TryAddWithoutValidation("Authorization", "Bearer " + apiKey);
                req.Content = new StringContent(body.ToString(), Encoding.UTF8, "application/json");

                using (var resp = await Http.SendAsync(req))
                {
                    string text = await resp.Content.ReadAsStringAsync();
                    if (!resp.IsSuccessStatusCode)
                        throw new Exception($"{(int)resp.StatusCode} {text}");

                    var json = JObject.Parse(text);
                    var msg = json["choices"]?[0]?["message"] as JObject;
                    if (msg == null) throw new Exception("Пустой ответ модели.");
                    return msg;
                }
            }
        }

        private string ExecuteTool(string root, string name, string argsJson)
        {
            try
            {
                var a = JObject.Parse(argsJson);
                switch (name)
                {
                    case "list_files": return Tools.ListFiles(root, a["dir"]?.ToString() ?? "");
                    case "read_file": return Tools.ReadFile(root, a["path"]?.ToString());
                    case "write_file":
                        string res = Tools.WriteFile(root, a["path"]?.ToString(), a["content"]?.ToString() ?? "");
                        _onMessage("файл", "✍ " + a["path"]);
                        return res;
                    default: return "Неизвестный инструмент: " + name;
                }
            }
            catch (Exception ex)
            {
                return "Ошибка инструмента: " + ex.Message;
            }
        }

        /// <summary>Корневая папка открытого решения. Должно вызываться из UI-потока.</summary>
        public static string GetSolutionRoot()
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var dte = Package.GetGlobalService(typeof(EnvDTE.DTE)) as EnvDTE.DTE;
            string sln = dte?.Solution?.FullName;
            if (!string.IsNullOrEmpty(sln) && File.Exists(sln))
                return Path.GetDirectoryName(sln);

            // Запасной вариант: папка активного документа.
            string doc = dte?.ActiveDocument?.FullName;
            if (!string.IsNullOrEmpty(doc))
                return Path.GetDirectoryName(doc);

            return null;
        }
    }
}
