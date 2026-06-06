# Claude Code Companion Widget - 设计文档

## 背景

Claude Code 每次修改/删除文件时需要用户在终端中确认，但用户往往在做其他工作，不关注 CLI 消息。需要一个桌面控件，在关键时刻提醒用户。

## 需求

1. **确认提醒**：Claude Code 需要用户确认时（如修改文件、执行命令），在控件中弹出提示，显示工具类型、目标文件等信息
2. **完成通知**：Claude Code 完成任务后，在控件中给出通知
3. **信息展示**：显示工具调用详情、对话内容摘要
4. **按需弹出**：平时隐藏在系统托盘，只在需要确认或任务完成时弹出窗口

## 技术选型

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 技术栈 | Electron + HTML/CSS/JS | 成熟稳定，生态丰富，开发速度快 |
| 事件集成 | Claude Code Hooks | 原生能力，无需修改 Claude Code 源码 |
| 事件传输 | curl POST → Express → WebSocket | 简单可靠，Windows 10+ 自带 curl |
| 窗口形式 | 系统托盘 + 按需弹出置顶窗口 | 不打扰日常工作，关键时刻弹出 |

## 架构设计

```
┌──────────────────────────────────────────────┐
│                settings.json                 │
│  hooks: PreToolUse / Stop / Notification     │
│  → curl POST http://localhost:3456/event     │
└──────────────┬───────────────────────────────┘
               │ HTTP POST (事件 JSON)
               ▼
┌──────────────────────────────────────────────┐
│           Electron Main Process              │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Express Server (port 3456)            │  │
│  │  POST /event   → 接收 hook 事件        │  │
│  │  GET  /events  → 查询历史事件           │  │
│  └────────────┬───────────────────────────┘  │
│               │ 内部转发                      │
│  ┌────────────▼───────────────────────────┐  │
│  │  WebSocket Server (ws)                 │  │
│  │  实时推送事件到渲染进程                   │  │
│  └────────────┬───────────────────────────┘  │
│               │                               │
│  ┌────────────▼───────────────────────────┐  │
│  │  BrowserWindow (置顶小窗口)             │  │
│  │  - 平时隐藏在托盘                        │  │
│  │  - 确认/完成事件时弹出                   │  │
│  │  - 显示工具详情、对话摘要、状态          │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Tray (系统托盘图标)                    │  │
│  │  - 右键菜单：显示窗口 / 退出            │  │
│  │  - 点击：弹出主窗口                     │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

## 数据流

```
Claude Code 触发事件
    │
    ▼
Hook 执行 curl POST（事件 JSON 含类型、工具名、输入参数等）
    │
    ▼
Express 接收并存入内存事件队列
    │
    ▼
WebSocket 广播给所有连接的渲染进程
    │
    ▼
前端根据事件类型决定行为：
  - PreToolUse（需确认）→ 弹出窗口，显示详情
  - Stop（任务完成）→ 弹出通知，显示摘要
  - Notification → 弹出通知
  - PostToolUse → 静默记录，不弹出
```

## 事件数据结构

Hook 通过 stdin 传入 JSON，我们将其转发到服务端：

```json
{
  "event": "PreToolUse" | "PostToolUse" | "Stop" | "Notification",
  "tool_name": "Edit" | "Write" | "Bash" | "Read" | ...,
  "tool_input": {
    "file_path": "/path/to/file",
    "command": "...",
    ...
  },
  "timestamp": "2026-06-06T12:00:00.000Z"
}
```

## Hooks 配置

在 Claude Code 的 `settings.json` 中配置：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|Bash|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:3456/event -H \"Content-Type: application/json\" -d \"{ \\\"event\\\": \\\"PreToolUse\\\", \\\"tool_name\\\": \\\"$CLAUDE_TOOL_NAME\\\", \\\"tool_input\\\": $(cat) }\""
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:3456/event -H \"Content-Type: application/json\" -d \"{ \\\"event\\\": \\\"Stop\\\", \\\"timestamp\\\": \\\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\\\" }\""
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:3456/event -H \"Content-Type: application/json\" -d \"{ \\\"event\\\": \\\"Notification\\\", \\\"message\\\": $(cat) }\""
          }
        ]
      }
    ]
  }
}
```

## 项目结构

```
D:\vibeCoding\
├── package.json
├── main.js                # Electron 主进程（Express + WebSocket + Tray）
├── preload.js             # Electron preload（安全桥接）
├── src/
│   ├── index.html         # 主窗口 HTML
│   ├── styles.css         # 样式
│   └── renderer.js        # 渲染进程逻辑
├── assets/
│   └── icon.png           # 托盘图标
└── docs/
    └── design.md          # 本文档
```

## 窗口设计

### 弹出窗口（300x400，置顶，无边框，右下角）

```
┌──────────────────────────────┐
│  ● Claude Code Monitor    ✕  │  ← 标题栏（可拖动，可关闭）
├──────────────────────────────┤
│                              │
│  ⚠ 需要确认                  │  ← 事件类型标签
│  工具: Edit                  │
│  文件: src/main.js           │  ← 工具详情
│                              │
├──────────────────────────────┤
│  ─────── 历史记录 ───────     │
│                              │
│  ✅ Read config.json         │  ← 已执行的工具
│  ✅ Edit src/app.js          │
│  ⏳ Edit src/main.js  ← 当前 │  ← 等待确认
│                              │
├──────────────────────────────┤
│  📋 任务完成 10:30           │  ← 最近一条通知
└──────────────────────────────┘
```

### 系统托盘

- 图标：小绿点（活跃）/ 小灰点（空闲）
- 右键菜单：显示窗口 / 清除历史 / 退出
- 点击：弹出主窗口

## 关键实现细节

### 1. 窗口弹出策略

- **PreToolUse 事件**（需确认的文件操作）：立即弹出 + Windows 系统通知
- **Stop 事件**（任务完成）：弹出 + 系统通知，5 秒后自动收起
- **PostToolUse 事件**：静默记录到历史列表，不弹出
- **Notification 事件**：弹出系统通知，不弹出窗口

### 2. 事件队列

内存中维护最近 100 条事件的队列，前端可滚动查看历史。应用重启后清空。

### 3. 端口冲突处理

默认使用 3456 端口。如果端口被占用，自动尝试 3457-3460，并在托盘 tooltip 中显示实际端口。Hooks 配置需要对应更新。

### 4. curl 可用性

Windows 10+ 自带 curl。如果检测不到 curl，启动时给出提示。

## 未涵盖 / 后续可扩展

- 方案 A（PTY 桥接）：实现在控件中直接点击同意/拒绝
- 多 Claude Code 实例同时运行的支持
- 事件持久化（数据库/文件存储）
- 自定义提醒规则（只对特定工具弹出）
