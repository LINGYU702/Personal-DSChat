# DeepSeek Chat — 仿 DeepSeek 网页端的对话应用

{写在前面}
{这个项目完全基于个人需求使用DeepSeek辅助制作，并不能保证后续的维护工作（因为我也是刚学计科）}
{# Personal-DSChat

一个基于 **DeepSeek API** 的仿官方网页端对话应用，支持**数学公式、代码高亮、Mermaid 图表、图片与多格式文档上传、对话分支**等完整功能。

---

## ✨ 功能特性

### 💬 对话体验
- **多会话管理**：本地持久化（IndexedDB）、重命名、搜索、深色模式
- **对话分支**：编辑任意用户消息或重新生成回复即创建分支，旧分支保留可切换
- **System Prompt 库**：内置基础提示词 + 自定义条目管理，会话级快照
- **上下文缓存**：前缀稳定策略最大化硬盘缓存命中，展示 token 用量与缓存命中率
- **流式体验**：SSE 逐 token 渲染 + 帧级节流，长文本不卡顿

### 📐 数学与排版
- **行内与块级公式**：基于 Streamdown + KaTeX 渲染，自动归一化多种 LaTeX 方言
- **公式配色**：支持 `\color{}` 命令，不同变量可区分颜色
- **Mermaid 图表**：支持流程图、时序图、状态图等，语法错误自动降级
- **代码高亮**：基于 Shiki，支持多语言语法着色与复制按钮
- **表格与列表**：斑马纹、hover 高亮、横向滚动

### 📎 文件上传
- **图片上传**：支持 JPEG/PNG/GIF/WebP，气泡内显示缩略图，点击放大预览
- **文档上传**：支持 `.txt / .md / .json / .csv / .log / .xml / .yaml / .pdf / .docx / .pptx`
- **本地解析**：浏览器端提取纯文本，PDF 按页分隔、PPT 提取表格结构

### 🎛️ 交互细节
- **深度思考**：开关 + 强度调节（低/高/最高），思维链可折叠查看
- **联网搜索**：服务端 `web_search` 工具，展示搜索状态与引用
- **数据备份**：全部会话 + System Prompt 库一键导出/导入为 JSON
- **单会话导出**：支持导出为本应用 JSON / OpenAI Responses 格式 / Markdown


**使用步骤**：

1. 打开页面，点击左下角的**设置**
2. 填入你自己的 **DeepSeek API Key**（从 [platform.deepseek.com](https://platform.deepseek.com/api_keys) 获取）
3. 返回对话界面，选择模型（推荐 **DeepSeek-V4 Flash**）
4. 开始对话

> 🔒 **安全说明**：API Key 仅保存在**你本机浏览器的 localStorage** 中，请求直接从浏览器发送给 DeepSeek 官方，不经过任何第三方服务器。

---

## 💻 本地运行

### 环境要求

- Node.js 18 或更高版本
- npm / pnpm / yarn（任选其一）

### 步骤

```bash
# 1. 克隆仓库
git clone https://github.com/LINGYU702/Personal-DSChat.git
cd Personal-DSChat

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev

# 4. 浏览器打开 http://localhost:3000

🙏 致谢
本项目基于 shine-yu-student/api_chat 二次开发。

衷心感谢原作者的杰出工作！原项目提供了完整的架构设计、精细的功能规划、详尽的文档体系，以及高度还原 DeepSeek 官方网页端的界面实现，为本项目奠定了坚实的地基。没有原作者的贡献，就不会有这个项目的诞生。

本项目在原项目基础上进行了以下主要改造：

🔄 Markdown 渲染引擎：从 react-markdown 切换为 Streamdown，从根本上解决流式渲染下公式解析不稳定、LaTeX 方言兼容性差的问题

📐 公式渲染增强：支持行内/块级公式、公式配色、多种 LaTeX 方言自动归一化

📊 Mermaid 图表支持：接入 @streamdown/mermaid，支持流程图、时序图等

📎 多格式文件上传：新增 PDF、Word、PPT、纯文本等文件的本地解析与上传

🖼️ 图片上传与预览：支持气泡内缩略图、点击全屏放大

🎨 排版美学优化：加大行高、段落间距、表格内边距，长公式独立成段

🔧 PPT 表格解析修复：修复表格内容显示为 [object Object] 的问题

📏 文件长度上限调整：适配 DeepSeek V4 的 1M token 上下文窗口

也感谢以下开源项目：

Streamdown — 专为 AI 流式输出设计的 Markdown 渲染器

KaTeX — 高性能数学公式渲染

Shiki — VS Code 同款代码高亮引擎

DeepSeek — 提供强大的 API 能力

⚠️ 免责声明
本项目仅供个人学习与研究使用，请勿用于商业用途

API Key 由使用者自行提供，所有调用费用由使用者承担

请遵守 DeepSeek 服务条款 及所在地区法律法规

因使用本项目产生的任何后果，作者不承担责任}

- 原作者的话如下：
基于 **DeepSeek Responses API**（OpenAI 兼容格式）的网页对话应用，界面整体仿照 [DeepSeek 网页端](https://chat.deepseek.com)。
支持模型切换、深度思考、服务端联网搜索、System Prompt 库、对话分支与上下文缓存利用。

完整设计文档见 [`docs/`](docs/README.md)（需求、架构、API 集成、前端、存储、测试等分模块编写，是实现的唯一依据）。

## 功能特性

| 功能 | 说明 |
|---|---|
| 模型选择 | DeepSeek-V4 Flash / Pro（顶栏切换；可用性由 `lib/deepseek/models.ts` 的 `MODEL_SUPPORT` 开关表统一控制，Flash/Pro 均已支持） |
| 深度思考 | 开/关 + 强度（低/高/最高），对应 Responses API `reasoning.effort`；思维链可折叠查看 |
| 联网搜索 | 服务端 `web_search` 工具（官方执行），搜索状态与引用展示 |
| System Prompt 库 | 内置基础 Prompt + 自定义条目管理；会话级快照，首条消息发送后锁定 |
| 对话分支 | 编辑任意输入消息或重新生成回复即创建分支，旧分支保留可切换（FR-12） |
| 上下文缓存 | 前缀稳定策略最大化硬盘缓存命中；每条回复展示 token 用量与缓存命中率 |
| 会话管理 | 多会话本地持久化（IndexedDB）、重命名、搜索、深色模式 |
| 侧边栏 | 桌面端可拖拽调整宽度（200~480px）并可完全收起，宽度/收起状态持久化（FR-14） |
| 数据备份 | 全部会话 + System Prompt 库一键导出为 JSON 备份文件，可导入恢复/合并（同 id 冲突保留本地，FR-15） |
| 单会话导出/导入 | 单个会话可导出为本应用 JSON / OpenAI Responses 格式 / Markdown 三种文件；可导入本应用 JSON 与 OpenAI Responses 格式会话（FR-16） |
| 流式体验 | SSE 逐 token 渲染 + 帧级节流（长文本不卡顿，FR-13） |

## 快速开始（本地开发）

```bash
npm install
npm run dev        # http://localhost:3000
```

浏览器打开后在 **设置** 中填入你的 DeepSeek API Key（`https://platform.deepseek.com/api_keys`）即可对话。

其他命令：

```bash
npm test           # 单元测试（vitest，75 用例）
npm run build      # 生产构建（自托管模式，含后端代理）
npm run start      # 启动生产服务器
```

## 部署

应用包含一个可选的后端代理（`/api/chat`，用于隐藏 Key 与统一错误处理），因此有两种部署形态：

| | **GitHub Pages（静态）** | **自托管 / Vercel（完整）** |
|---|---|---|
| 后端代理 | ❌ 无 Node 运行时 | ✅ 完整可用 |
| 请求路径 | 浏览器**直连** DeepSeek API（官方已支持 CORS，已验证） | 浏览器 → 自有代理 → DeepSeek |
| API Key 去向 | 浏览器直接发送给 DeepSeek 官方 | 发送给自有代理（代理不落盘） |
| 构建命令 | `npm run build:pages`（输出 `out/`） | `npm run build` |

两种形态共用同一套前端代码，构建时通过环境变量切换（见 `scripts/build-pages.mjs`）。

### 方式一：GitHub Pages（纯静态）

1. 将仓库推送到 GitHub（`main` 分支）；
2. 仓库 **Settings → Pages → Source** 选择 **GitHub Actions**；
3. push 后 `.github/workflows/deploy-pages.yml` 自动构建并部署，站点地址为 `https://<你的用户名>.github.io/<仓库名>/`。

> 部署为纯静态站点：API Key 保存在浏览器 localStorage，请求直接发给 DeepSeek 官方（`api.deepseek.com`）。
> 这是无后端托管下的标准做法（CORS 已验证支持）；如需隐藏 Key，请使用方式二自托管。
>
> 若部署到用户主页（仓库名 = `<用户名>.github.io`）或自定义域名，workflow 会自动适配路径。

### 方式二：自托管 / Vercel（完整功能）

```bash
npm run build
npm run start     # 监听 3000 端口；或部署到 Vercel（Node runtime）
```

需要反向代理（Nginx/Caddy）时，请确保 SSE 头透传（响应已带 `X-Accel-Buffering: no`）。

## 架构概览

```
浏览器（Next.js 前端）                   后端代理（可选）               DeepSeek
┌───────────────────────┐   fetch/SSE   ┌────────────────────┐  openai SDK  ┌──────────────────┐
│ React 19 + zustand     │ ───────────▶ │ POST /api/chat      │ ───────────▶ │ api.deepseek.com │
│ IndexedDB / localStorage│ ◀─────────── │（事件原样透传）       │ ◀─────────── │ /v1/responses    │
└───────────────────────┘               └────────────────────┘              └──────────────────┘
        ▲ 直连模式（GitHub Pages）：跳过代理，浏览器直接请求 DeepSeek（CORS 已验证）
```

- **Responses API 是无状态 API**：多轮上下文由客户端维护并全量发送（input items），天然利于前缀缓存
- 上下文硬盘缓存自动管理，客户端通过「前缀稳定」策略（会话内不重排/不改写/分支点外不删减）最大化命中
- 流式：DeepSeek SSE 事件 → （代理透传）→ 前端帧级节流渲染，无 `[DONE]`，以 `response.completed/incomplete/failed` 收尾

## 技术栈

Next.js 16（App Router） · React 19 · TypeScript（strict） · Tailwind CSS 4 · shadcn/ui 风格组件（Radix）
zustand（状态） · openai SDK（后端代理） · react-markdown + KaTeX + highlight.js（渲染）
idb（IndexedDB） · vitest + fake-indexeddb（测试）

## 测试

```bash
npm test
```

75 个用例覆盖：请求构造、input items 映射（含 web_search_call/reasoning 回传）、SSE 解析、
分支语义（编辑/重新生成/切换/迁移）、持久化链路（发送 → 刷新 → 恢复）、System Prompt 库、
上下文截断与超限重试、流式帧节流与 Tooltip 回归等。

单会话导出/导入（FR-16）用例见 `tests/session-io.test.ts`。

## 文档索引

完整设计文档位于 [`docs/`](docs/README.md)：

```
docs/
├── 01-requirements/      # 需求规格（FR-1 ~ FR-13，含验收标准）
├── 02-architecture/      # 架构设计、数据流、依赖清单
├── 03-api-integration/   # Responses API、流式、思考、联网、缓存、错误处理
├── 04-frontend/          # UI 设计、状态管理、Markdown 渲染、设置、System Prompt 库
├── 05-backend/           # 代理端点、安全设计
├── 06-storage/           # IndexedDB / localStorage 持久化
└── 07-implementation/    # 实现顺序、测试方案
```

## 已知限制

- 模型可用性由 `MODEL_SUPPORT` 开关表统一判定（`deepseek-v4-flash` / `deepseek-v4-pro` 均已支持 Responses API，见 `lib/deepseek/models.ts`）
- 会话与 System Prompt 库仅存**本机浏览器**（IndexedDB/localStorage），无账号体系与云端同步
- 不支持文件上传/图片理解（Responses API 输入不支持图片）
- GitHub Pages 静态部署下无后端代理（直连 DeepSeek 官方，Key 不经第三方中转）

## 安全说明

- API Key 仅存浏览器 localStorage，代理模式只发送给自有后端（不落盘、不打日志），直连模式只发送给 DeepSeek 官方
- 不渲染原始 HTML（react-markdown 默认安全），链接一律 `noopener noreferrer`，无 `dangerouslySetInnerHTML`
- 「System Prompt 锁定」是 UX 约束而非安全边界（客户端可构造任意 instructions），详见 `docs/05-backend/security.md`
