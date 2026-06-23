using System;
using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Woki.Agent;

namespace Woki.UI
{
    public partial class WokiControl : UserControl
    {
        private readonly ObservableCollection<ChatLine> _log = new ObservableCollection<ChatLine>();
        private readonly WokiAgent _agent;
        private WokiSettings _settings;

        public WokiControl()
        {
            InitializeComponent();
            LogList.ItemsSource = _log;

            _settings = WokiSettings.Load();
            _agent = new WokiAgent(
                getSettings: () => _settings,
                onMessage: (role, text) => Dispatcher.Invoke(() => AddLine(role, text)));

            ApplySettingsToUi();
        }

        private void AddLine(string role, string text)
        {
            _log.Add(new ChatLine { Role = role, Text = text });
            LogScroll.ScrollToEnd();
        }

        private void ApplySettingsToUi()
        {
            foreach (ComboBoxItem item in ProviderBox.Items)
            {
                if ((item.Content?.ToString() ?? "") == _settings.Provider)
                {
                    ProviderBox.SelectedItem = item;
                    break;
                }
            }
            if (ProviderBox.SelectedItem == null && ProviderBox.Items.Count > 0)
                ProviderBox.SelectedIndex = 0;

            ModelBox.Text = _settings.Model;
        }

        private string SelectedProvider()
        {
            return (ProviderBox.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "nvidia";
        }

        private void OnToggleSettings(object sender, RoutedEventArgs e)
        {
            SettingsPanel.Visibility =
                SettingsPanel.Visibility == Visibility.Visible ? Visibility.Collapsed : Visibility.Visible;
        }

        private void OnProviderChanged(object sender, SelectionChangedEventArgs e)
        {
            if (ProviderBox.SelectedItem is ComboBoxItem item && ModelBox != null)
            {
                string prov = item.Content?.ToString() ?? "nvidia";
                if (string.IsNullOrWhiteSpace(ModelBox.Text) || ModelBox.Text == _settings.Model)
                    ModelBox.Text = prov == "nvidia" ? "deepseek-ai/deepseek-v3" : "openai/gpt-4o";
            }
        }

        private void OnSaveSettings(object sender, RoutedEventArgs e)
        {
            _settings.Provider = SelectedProvider();
            _settings.Model = (ModelBox.Text ?? "").Trim();
            if (!string.IsNullOrEmpty(KeyBox.Password))
                _settings.SetKey(_settings.Provider, KeyBox.Password);
            _settings.Save();
            KeyBox.Clear();
            AddLine("система", $"⚙ Сохранено: {_settings.Provider} · {_settings.Model}");
            SettingsPanel.Visibility = Visibility.Collapsed;
        }

        private void OnInputKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                e.Handled = true;
                Send();
            }
        }

        private void OnSend(object sender, RoutedEventArgs e) => Send();

        private async void Send()
        {
            string task = (InputBox.Text ?? "").Trim();
            if (task.Length == 0) return;
            InputBox.Clear();
            AddLine("ты", task);
            SendButton.IsEnabled = false;
            try
            {
                await _agent.RunAsync(task);
            }
            catch (Exception ex)
            {
                AddLine("ошибка", ex.Message);
            }
            finally
            {
                SendButton.IsEnabled = true;
            }
        }
    }

    public class ChatLine
    {
        public string Role { get; set; }
        public string Text { get; set; }
    }
}
