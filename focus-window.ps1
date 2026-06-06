param([int]$StartPid = 0)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
}
"@

function Focus-Window([IntPtr]$hWnd) {
    if ([WinAPI]::IsZoomed($hWnd)) {
        [WinAPI]::ShowWindow($hWnd, 3)  # SW_SHOWMAXIMIZED
    } else {
        [WinAPI]::ShowWindow($hWnd, 9)  # SW_RESTORE
    }
    [WinAPI]::SetForegroundWindow($hWnd)
    exit 0
}

# Strategy 1: Walk up from given PID to find a windowed process
if ($StartPid -gt 0) {
    $currentPid = $StartPid
    $visited = @{}
    while ($currentPid -gt 0 -and -not $visited.ContainsKey($currentPid)) {
        $visited[$currentPid] = $true
        try {
            $proc = Get-Process -Id $currentPid -ErrorAction Stop
            if ($proc.MainWindowHandle -ne [IntPtr]::Zero) {
                Focus-Window $proc.MainWindowHandle
            }
            $wmiProc = Get-CimInstance Win32_Process -Filter "ProcessId=$currentPid" -ErrorAction SilentlyContinue
            if ($wmiProc) { $currentPid = $wmiProc.ParentProcessId } else { break }
        } catch {
            break
        }
    }
}

# Strategy 2: Find terminal by process name (fallback)
$terminals = @('WindowsTerminal', 'mintty', 'ConEmu64', 'ConEmu')
foreach ($name in $terminals) {
    $proc = Get-Process $name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc -and $proc.MainWindowHandle -ne [IntPtr]::Zero) {
        Focus-Window $proc.MainWindowHandle
    }
}

exit 1
