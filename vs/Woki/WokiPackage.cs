using System;
using System.ComponentModel.Design;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.VisualStudio;
using Microsoft.VisualStudio.Shell;
using Task = System.Threading.Tasks.Task;

namespace Woki
{
    /// <summary>
    /// Точка входа расширения. Регистрирует команду «WOKI — AI агент»
    /// (меню View → Other Windows) и окно-панель агента.
    /// </summary>
    [PackageRegistration(UseManagedResourcesOnly = true, AllowsBackgroundLoading = true)]
    [InstalledProductRegistration("WOKI", "AI агент-кодер для Visual Studio", "0.1.0")]
    [ProvideMenuResource("Menus.ctmenu", 1)]
    [ProvideToolWindow(typeof(WokiToolWindow))]
    [Guid(PackageGuids.WokiPackageString)]
    public sealed class WokiPackage : AsyncPackage
    {
        protected override async Task InitializeAsync(
            CancellationToken cancellationToken,
            IProgress<ServiceProgressData> progress)
        {
            await this.JoinableTaskFactory.SwitchToMainThreadAsync(cancellationToken);

            if (await GetServiceAsync(typeof(IMenuCommandService)) is OleMenuCommandService mcs)
            {
                var id = new CommandID(PackageGuids.WokiCmdSet, PackageIds.OpenWokiCommand);
                mcs.AddCommand(new MenuCommand(ShowToolWindow, id));
            }
        }

        private void ShowToolWindow(object sender, EventArgs e)
        {
            _ = this.JoinableTaskFactory.RunAsync(async () =>
            {
                ToolWindowPane window = await this.ShowToolWindowAsync(
                    typeof(WokiToolWindow), 0, create: true, cancellationToken: this.DisposalToken);
                if (window?.Frame == null)
                    throw new NotSupportedException("Не удалось открыть окно WOKI.");
            });
        }
    }
}
