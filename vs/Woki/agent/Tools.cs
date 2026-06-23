using System;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace Woki.Agent
{
    /// <summary>Инструменты агента и их описание для модели (формат OpenAI tools).</summary>
    internal static class Tools
    {
        public static JArray Schemas()
        {
            return new JArray
            {
                Fn("list_files", "Показать файлы и папки проекта (или поддиректории).",
                    new JObject { ["dir"] = Prop("string", "Относительный путь от корня. Пусто = корень.") }),
                Fn("read_file", "Прочитать содержимое файла. Всегда читай перед изменением.",
                    new JObject { ["path"] = Prop("string", "Относительный путь к файлу.") }, "path"),
                Fn("write_file", "Создать или полностью перезаписать файл. Передавай полное содержимое.",
                    new JObject
                    {
                        ["path"] = Prop("string", "Относительный путь к файлу."),
                        ["content"] = Prop("string", "Полное содержимое файла.")
                    }, "path", "content")
            };
        }

        private static JObject Prop(string type, string desc) =>
            new JObject { ["type"] = type, ["description"] = desc };

        private static JObject Fn(string name, string desc, JObject props, params string[] required)
        {
            var parameters = new JObject
            {
                ["type"] = "object",
                ["properties"] = props
            };
            if (required.Length > 0)
                parameters["required"] = new JArray(required.Cast<object>().ToArray());

            return new JObject
            {
                ["type"] = "function",
                ["function"] = new JObject
                {
                    ["name"] = name,
                    ["description"] = desc,
                    ["parameters"] = parameters
                }
            };
        }

        // --- Реализация ---

        private static string Resolve(string root, string rel)
        {
            string full = Path.GetFullPath(Path.Combine(root, rel ?? ""));
            // Защита от выхода за пределы проекта.
            if (!full.StartsWith(Path.GetFullPath(root), StringComparison.OrdinalIgnoreCase))
                throw new Exception("Путь вне проекта запрещён.");
            return full;
        }

        public static string ListFiles(string root, string dir)
        {
            string target = Resolve(root, dir);
            if (!Directory.Exists(target)) return "Папка не найдена: " + dir;

            var sb = new System.Text.StringBuilder();
            foreach (var d in Directory.GetDirectories(target))
            {
                string name = Path.GetFileName(d);
                if (name == "bin" || name == "obj" || name == ".git" || name == ".vs") continue;
                sb.AppendLine(name + "/");
            }
            foreach (var f in Directory.GetFiles(target))
                sb.AppendLine(Path.GetFileName(f));

            return sb.Length == 0 ? "(пусто)" : sb.ToString();
        }

        public static string ReadFile(string root, string path)
        {
            if (string.IsNullOrEmpty(path)) return "Не указан path.";
            string full = Resolve(root, path);
            if (!File.Exists(full)) return "Файл не найден: " + path;
            string text = File.ReadAllText(full);
            return text.Length > 14000 ? text.Substring(0, 14000) + "\n…(обрезано)" : text;
        }

        public static string WriteFile(string root, string path, string content)
        {
            if (string.IsNullOrEmpty(path)) return "Не указан path.";
            string full = Resolve(root, path);
            Directory.CreateDirectory(Path.GetDirectoryName(full));
            File.WriteAllText(full, content);
            return "Сохранён файл: " + path;
        }
    }
}
