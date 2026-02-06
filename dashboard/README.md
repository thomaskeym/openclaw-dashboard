# OpenClaw 作战指挥中心

<p align="center">
  <strong>OpenClaw Command Center Dashboard</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/WebSocket-实时通信-blue" alt="WebSocket">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
</p>

<p align="center">
  一个实时监控 OpenClaw 多 Agent 系统的作战指挥中心风格看板，纯前端 + 本地 API，不修改 OpenClaw 官方代码。
</p>

---

## 📸 预览



<p align="center">
  <img src="docs/screenshot.png" alt="Dashboard Screenshot" width="800">
</p>


---

## ✨ 功能特性

| 模块 | 功能 |
|------|------|
| 🖥️ **系统概览** | 实时显示 Gateway 进程状态、CPU/内存使用率、主机信息 |
| 🤖 **Agent 组织架构** | 可视化展示所有 Agent 层级关系、角色、当前使用模型，支持会话详情 |
| 📊 **模型使用量统计** | 按模型 / Agent / 日趋势统计调用量，支持 7/14/30 天范围 |
| 📋 **任务管理** | 当前任务与历史任务列表，任务标题与消息历史详情 |
| 💎 **模型配额** | 各 AI 模型余量（支持 Minimax、Moonshot 等） |
| 📈 **性能与健康趋势** | CPU/内存历史曲线、健康度趋势图 |
| 📝 **实时日志** | 实时系统日志，支持过滤与搜索 |
| **右侧边栏** | 💚 健康度评分与问题列表、📡 通道状态（Telegram/Discord/Feishu 等）、⚡ 快捷操作（重启 Gateway、清理日志、导出报告等） |

**交互与布局**

- 瀑布流布局，卡片可拖拽排序，顺序持久化到本地
- 主题切换（明/暗）、全屏、刷新暂停、快捷键（F5 刷新、Esc 关弹窗等）
- 全局搜索、Agent/任务筛选

---

## 🚀 快速开始

**前置**：本机已安装 Node.js 18+，并已配置 OpenClaw（存在 `~/.openclaw/openclaw.json` 及 Agent/会话数据即可，看板只读不写）。

### 安装依赖

```bash
cd dashboard
npm install
```

### 启动服务

```bash
# 生产模式
npm start

# 开发模式（自动重启）
npm run dev

# 指定端口
PORT=8080 npm start
```

### 访问

- 本机：**http://localhost:3000**
- 局域网：先 `HOST=0.0.0.0 npm start`，再使用本机 IP 访问，如 `http://192.168.x.x:3000`

---

## 🛠️ 技术栈

- **后端**: Node.js + Express
- **前端**: 原生 HTML/CSS/JavaScript（无框架依赖）
- **实时通信**: WebSocket
- **图表**: Chart.js
- **数据采集**: 文件系统监控 + 进程监控

---

## 📡 API 端点

### 系统相关
| 端点 | 描述 |
|------|------|
| `GET /api/dashboard` | 完整看板数据（前端初始化用） |
| `GET /api/system/overview` | 系统概览 |
| `GET /api/system/resources` | 系统资源（CPU/内存/磁盘等） |
| `GET /api/health` | 系统健康度 |
| `GET /api/metrics/history` | 性能指标历史 |
| `GET /api/health/history` | 健康度历史 |

### Agent 相关
| 端点 | 描述 |
|------|------|
| `GET /api/agents/list` | Agent 列表 |
| `GET /api/agents/:id/status` | Agent 状态 |
| `GET /api/agents/:id/details` | Agent 详情 |
| `GET /api/agents/:agentId/sessions/:sessionId` | 会话消息详情 |

### 任务相关
| 端点 | 描述 |
|------|------|
| `GET /api/tasks/current` | 当前任务 |
| `GET /api/tasks/history` | 任务历史 |
| `GET /api/tasks/:id/details` | 任务详情（含消息历史） |

### 通道与模型
| 端点 | 描述 |
|------|------|
| `GET /api/channels/status` | 通道状态 |
| `GET /api/models/quota` | 模型配额 |
| `GET /api/models/usage?days=7\|14\|30` | 模型使用量统计 |

### 其他
| 端点 | 描述 |
|------|------|
| `GET /api/logs/recent` | 最近日志 |
| `POST /api/actions/restart-gateway` | 重启 Gateway |
| `POST /api/actions/export-report` | 导出报告 |
| `WS /ws` | WebSocket 实时更新 |

---

## ⚙️ 配置

看板自动读取 **`~/.openclaw/openclaw.json`**，不修改 OpenClaw 官方配置即可使用。

### 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `PORT` | 3000 | 服务端口 |
| `HOST` | 127.0.0.1 | 监听地址；设为 `0.0.0.0` 时可局域网访问 |

---

## 🔧 故障排查

<details>
<summary><strong>前端数据无法加载</strong></summary>

1. 检查服务是否运行：`node diagnose.js`
2. 检查静态文件路径：`curl http://localhost:3000/api/debug/static-path`
3. 浏览器硬刷新：`Cmd+Shift+R` 或 `Ctrl+Shift+R`

</details>

<details>
<summary><strong>端口被占用</strong></summary>

```bash
# 使用其他端口
PORT=8080 npm start

# 或查找占用进程
lsof -i :3000
```

</details>

<details>
<summary><strong>数据不更新</strong></summary>

- 检查 `~/.openclaw/openclaw.json` 是否存在
- 检查 `~/.openclaw/agents/` 目录权限
- 检查日志文件权限

</details>

<details>
<summary><strong>本机访问显示「Gateway 已停止」，局域网其他设备访问正常</strong></summary>

通常是因为本机同时跑了两套看板服务：

1. **在 Cursor/IDE 里启动**（或默认 `HOST=127.0.0.1`）：只监听本机，且沙箱可能禁止执行 `ps` 等命令，无法检测 Gateway 进程 → 显示「已停止」。
2. **在系统终端里用 `HOST=0.0.0.0` 启动**：监听所有网卡，局域网访问的是这个实例，能正常执行 `ps` → 显示「运行中」。

**建议**：只保留一个实例。在**系统自带终端**（非 IDE 内终端）执行：

```bash
cd dashboard
HOST=0.0.0.0 npm start
```

之后本机用 **http://localhost:3000**、其他设备用 **http://你的本机IP:3000** 访问同一服务，Gateway 状态会一致且正常。

</details>

---

## 📁 项目结构

```
dashboard/
├── server.js             # 主服务入口
├── data-collector.js     # 数据采集（openclaw.json、会话 jsonl、进程等）
├── index.html            # 主页面（含右侧边栏）
├── index-sidebar.html    # 带完整侧栏布局的备用页面
├── static/
│   ├── css/              # 样式（含 right-sidebar.css 等）
│   └── js/               # 前端脚本（dashboard、charts、拖拽与主题等）
├── modules/              # 服务端功能模块
├── data/                 # 运行时数据（可被 .gitignore）
├── diagnose.js           # 诊断脚本
└── README.md
```

---

## 📄 License

MIT License - 详见 [LICENSE](LICENSE) 文件

---

## 🤝 相关项目

- **OpenClaw** - 多 Agent 协作框架（本看板为其辅助监控工具，不依赖其源码修改）

---

<p align="center">
  Made with ❤️ for OpenClaw
</p>
