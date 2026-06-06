# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Electron 桌面小控件，用于监控 Claude Code 事件。常驻系统托盘，在 Claude Code 需要用户确认或任务完成时弹出窗口通知。支持深色/浅色主题跟随系统。UI 使用中文。

## 常用命令

- `npm start` — 启动 Electron 应用（开发模式）
- `npm run setup-hooks` — 手动配置 hooks 到 `~/.claude/settings.json`
- `npm run build` — 打包成 Windows NSIS 安装包（输出到 `dist/`）
- `npm run build:dir` — 打包成免安装目录（用于测试打包）

## 架构与数据流

```
Claude Code hooks (settings.json)
  → hook.js (从 stdin 读取 hook 数据，自动启动/关闭监控器)
    → Express POST /event (端口 3456)
      → main.js (智能弹窗判断 + IPC 推送到 BrowserWindow)
        → renderer.js (渲染事件列表)
```

## 核心文件

**main.js** — Electron 主进程。包含 Express 服务器、BrowserWindow（置顶无边框）、系统托盘（从 PNG 加载图标）、系统通知、智能弹窗判断（1.5s 延迟区分自动批准/需确认）、主题检测（`nativeTheme`）、10 分钟空闲自动关闭、首次启动自动配置 hooks。

**hook.js** — Claude Code hooks 通过 `node hook.js <事件类型>` 调用。从 stdin 读 JSON，ping 监控器，未运行则自动启动 Electron（等待最多 10s），POST 事件。Stop 事件后延迟 3s 发送 /shutdown 关闭监控器。附带 `_ppid` 用于点击跳转终端。

**preload.js** — contextBridge 暴露 `window.monitor` API：事件监听、历史查询、窗口控制、终端聚焦、主题获取。

**renderer.js** — 事件渲染，按类型用不同颜色卡片显示。点击事件条目可跳转到对应终端窗口。

**src/styles.css** — CSS 变量实现深色/浅色主题切换，`[data-theme="light"]` 覆盖默认深色变量。

**src/index.html** — 主窗口 HTML，360x480 无边框置顶窗口。

**focus-window.ps1** — PowerShell 脚本，沿进程树向上查找有窗口的进程并置顶。用 `IsZoomed` 保留最大化状态（最大化用 `SW_SHOWMAXIMIZED`，否则用 `SW_RESTORE`）。

**setup-hooks.js** — 向 `~/.claude/settings.json` 写入 hook 条目，检测已有条目避免重复。

**assets/tray-icon.png** — 托盘图标，Claude Logo + 绿色状态点，透明背景。

**icon-preview.html** — 开发用图标预览工具，可预览和导出不同图标设计方案。

## 关键行为

### 智能弹窗判断
PreToolUse 不立即弹窗，等 1.5 秒观察：
- 1.5 秒内 PostToolUse 到达 → 自动批准的工具 → 不弹窗
- 1.5 秒未到达 → 用户正在确认 → 弹窗提醒

### 点击跳转终端
事件条目可点击，调用 `focus-window.ps1` 将对应终端置顶。先沿 ppid 进程树查找，找不到则按进程名（WindowsTerminal、mintty 等）回退查找。保留最大化状态。

### 自动启停
- 第一个 hook 事件触发时自动拉起 Electron（hook.js 检测 + spawn）
- Stop hook 触发后自动关闭 Electron
- 终端被强制关闭时：10 分钟无新事件 → 自动关闭

### 主题跟随系统
通过 `nativeTheme.shouldUseDarkColors` 检测，CSS 变量切换深色/浅色。切换系统主题时实时响应。

### 首次启动
打包后的应用首次启动时，自动将 hooks 写入 `~/.claude/settings.json`，并创建 `~/.claude-code-monitor-setup` 标记文件避免重复配置。

## 约束

- 端口 3456（冲突时回退 3457）
- 内存事件队列上限 100 条，重启后清空
- 窗口：360x480、无边框、置顶、主显示器右下角
- 托盘图标从 `assets/tray-icon.png` 加载（Claude Logo + 绿色状态点，透明背景）
- hook.js 依赖 `node` 命令可用
- focus-window.ps1 依赖 Windows PowerShell
- 仅支持 Windows
