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

function Focus-Window {
    param([IntPtr]$hWnd)
    if ([WinAPI]::IsZoomed($hWnd)) {
        [WinAPI]::ShowWindow($hWnd, 3)
    } else {
        [WinAPI]::ShowWindow($hWnd, 9)
    }
    [WinAPI]::SetForegroundWindow($hWnd)
    exit 0
}

if ($StartPid -gt 0) {
    $currentPid = $StartPid
    $visited = @{}
    $maxIterations = 20
    $iterations = 0

    while ($currentPid -gt 0 -and $iterations -lt $maxIterations -and -not $visited.ContainsKey($currentPid)) {
        $visited[$currentPid] = $true
        $iterations++
        try {
            $proc = Get-Process -Id $currentPid -ErrorAction Stop
            if ($proc.MainWindowHandle -ne [IntPtr]::Zero) {
                Focus-Window $proc.MainWindowHandle
            }
            $wmiProc = Get-CimInstance Win32_Process -Filter "ProcessId=$currentPid" -ErrorAction SilentlyContinue
            if ($wmiProc) {
                $currentPid = $wmiProc.ParentProcessId
            } else {
                break
            }
        } catch {
            break
        }
    }
}

$terminals = @('WindowsTerminal', 'mintty', 'ConEmu64', 'ConEmu')
foreach ($name in $terminals) {
    $procs = Get-Process $name -ErrorAction SilentlyContinue
    if ($procs) {
        foreach ($proc in $procs) {
            if ($proc.MainWindowHandle -ne [IntPtr]::Zero) {
                Focus-Window $proc.MainWindowHandle
            }
        }
    }
}

exit 1