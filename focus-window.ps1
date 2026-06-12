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

# 策略1：从给定的进程ID向上查找有窗口的进程
if ($StartPid -gt 0) {
    $currentPid = $StartPid
    $visited = @{}
    $maxIterations = 20  # 防止无限循环
    $iterations = 0

    while ($currentPid -gt 0 -and $iterations -lt $maxIterations -and -not $visited.ContainsKey($currentPid)) {
        $visited[$currentPid] = $true
        $iterations++
        try {
            $proc = Get-Process -Id $currentPid -ErrorAction Stop
            # 检查此进程是否有主窗口
            if ($proc.MainWindowHandle -ne [IntPtr]::Zero) {
                Focus-Window $proc.MainWindowHandle
            }
            # 向上查找父进程
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

# 策略2：按进程名查找终端（回退方案 - 仅在策略1失败时使用）
# 注意：此方法准确性较低，可能会选择错误的终端
$terminals = @('WindowsTerminal', 'mintty', 'ConEmu64', 'ConEmu')
foreach ($name in $terminals) {
    $procs = Get-Process $name -ErrorAction SilentlyContinue
    if ($procs) {
        # Try to find the most recently active terminal
        foreach ($proc in $procs) {
            if ($proc.MainWindowHandle -ne [IntPtr]::Zero) {
                Focus-Window $proc.MainWindowHandle
            }
        }
    }
}

exit 1
