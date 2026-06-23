using System.Runtime.InteropServices;
using Microsoft.VisualStudio.Shell;
using Woki.UI;

namespace Woki
{
    /// <summary>Окно-панель WOKI. Содержимое — WPF-контрол с чатом.</summary>
    [Guid(PackageGuids.WokiToolWindowString)]
    public class WokiToolWindow : ToolWindowPane
    {
        public WokiToolWindow() : base(null)
        {
            this.Caption = "WOKI";
            this.Content = new WokiControl();
        }
    }
}
