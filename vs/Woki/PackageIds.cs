using System;

namespace Woki
{
    /// <summary>GUID-ы и идентификаторы команд (совпадают с WokiPackage.vsct).</summary>
    internal static class PackageGuids
    {
        public const string WokiPackageString = "f3b9a1c2-1d4e-4a8b-9c2f-7e6d5a4b3c21";
        public const string WokiToolWindowString = "9c8b7a6d-5e4f-43c2-b1a0-0f1e2d3c4b5a";
        public const string WokiCmdSetString = "a1b2c3d4-e5f6-47a8-b9c0-d1e2f3a4b5c6";

        public static readonly Guid WokiCmdSet = new Guid(WokiCmdSetString);
    }

    internal static class PackageIds
    {
        public const int OpenWokiCommand = 0x0100;
        public const int WokiMenuGroup = 0x1020;
    }
}
