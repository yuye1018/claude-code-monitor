# Claude Code Monitor

一个 Electron 桌面小控件，用于监控 [Claude Code](https://claude.ai/code) 的运行状态。常驻系统托盘，在 Claude Code 需要用户确认或任务完成时弹出通知窗口。

## 功能特性

- **智能确认提醒** — 当 Claude Code 需要用户确认（编辑/写入/执行命令）时弹出通知，自动批准的操作不会打扰
- **任务完成通知** — Claude Code 完成任务后弹窗提醒
- **点击跳转终端** — 点击事件条目，自动将对应终端窗口置顶（支持最大化状态保留）
- **自动启停** — 随 Claude Code 自动启动，Claude Code 停止后自动关闭
- **系统主题跟随** — 支持深色/浅色主题，跟随系统设置实时切换
- **系统托盘** — Claude Logo 托盘图标，右键菜单控制

## 安装

### 从源码运行

```bash
git clone https://github.com/yuye1018/claude-code-monitor.git
cd claude-code-monitor
npm install
npm start
```

### 打包安装

```bash
npm run build        # 生成 NSIS 安装包到 dist/
npm run build:dir    # 生成免安装目录（用于测试）
```

打包后的应用首次启动时会自动配置 Claude Code hooks。

## 使用方法

1. 启动 Claude Code Monitor（`npm start` 或安装后启动）
2. 正常使用 Claude Code
3. 当 Claude Code 需要确认时，右下角会弹出通知窗口
4. 点击事件条目可跳转到对应的终端窗口

### 手动配置 Hooks

如果自动配置未生效，可手动执行：

```bash
npm run setup-hooks
```

## 工作原理

```
Claude Code hooks (~/.claude/settings.json)
  → hook.js (读取 hook 数据，自动启动/关闭监控器)
    → Express POST /event (localhost:3456)
      → main.js (智能弹窗判断 + 推送到窗口)
        → renderer.js (渲染事件列表)
```

### 智能弹窗判断

- 收到 `PreToolUse` 后等待 1.5 秒
- 1.5 秒内收到 `PostToolUse` → 自动批准的操作 → 不弹窗
- 1.5 秒未收到 → 用户正在手动确认 → 弹窗提醒

## 技术栈

- [Electron](https://www.electronjs.org/) — 桌面应用框架
- [Express](https://expressjs.com/) — 本地 HTTP 服务器接收 hook 事件
- PowerShell — 终端窗口置顶脚本

## 系统要求

- Windows 10/11
- [Node.js](https://nodejs.org/) 18+
- [Claude Code](https://claude.ai/code) CLI

## 项目结构

```
claude-code-monitor/
├── main.js              # Electron 主进程
├── hook.js              # Claude Code hook 桥接脚本
├── preload.js           # Electron preload 脚本
├── setup-hooks.js       # Hooks 配置脚本
├── focus-window.ps1     # 终端窗口置顶 PowerShell 脚本
├── assets/
│   └── tray-icon.png    # 托盘图标
├── src/
│   ├── index.html       # 主窗口 HTML
│   ├── renderer.js      # 前端渲染逻辑
│   └── styles.css       # 样式（深色/浅色主题）
└── docs/
    └── design.md        # 设计文档
```

## License

MIT
