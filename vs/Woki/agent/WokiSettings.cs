using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;

namespace Woki.Agent
{
    /// <summary>
    /// Настройки WOKI: провайдер, модель и API-ключи.
    /// Хранятся в %APPDATA%\WOKI\settings.json. Ключи шифруются
    /// через Windows DPAPI (привязаны к пользователю Windows).
    /// </summary>
    public class WokiSettings
    {
        public string Provider { get; set; } = "nvidia";
        public string Model { get; set; } = "deepseek-ai/deepseek-v3";

        // Зашифрованные ключи: имя провайдера -> base64(DPAPI(ключ)).
        public Dictionary<string, string> EncryptedKeys { get; set; } = new Dictionary<string, string>();

        private static string Dir =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "WOKI");

        private static string FilePath => Path.Combine(Dir, "settings.json");

        public static WokiSettings Load()
        {
            try
            {
                if (File.Exists(FilePath))
                    return JsonConvert.DeserializeObject<WokiSettings>(File.ReadAllText(FilePath)) ?? new WokiSettings();
            }
            catch { /* битый файл — начнём заново */ }
            return new WokiSettings();
        }

        public void Save()
        {
            Directory.CreateDirectory(Dir);
            File.WriteAllText(FilePath, JsonConvert.SerializeObject(this, Formatting.Indented));
        }

        public void SetKey(string provider, string key)
        {
            byte[] enc = ProtectedData.Protect(Encoding.UTF8.GetBytes(key), null, DataProtectionScope.CurrentUser);
            EncryptedKeys[provider] = Convert.ToBase64String(enc);
        }

        public string GetKey(string provider)
        {
            if (!EncryptedKeys.TryGetValue(provider, out string b64) || string.IsNullOrEmpty(b64))
                return null;
            try
            {
                byte[] dec = ProtectedData.Unprotect(Convert.FromBase64String(b64), null, DataProtectionScope.CurrentUser);
                return Encoding.UTF8.GetString(dec);
            }
            catch { return null; }
        }
    }
}
