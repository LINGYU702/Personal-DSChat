# 界面设计（仿 DeepSeek 网页端）

> 定义整体界面布局、组件树、交互细节与视觉规范，目标是与 chat.deepseek.com 高度相似。
> 实现时以本文件为 UI 唯一依据；配色/尺寸为建议值，可微调但保持风格一致。

## 1. 整体布局

```
┌────────────────────────────────────────────────────────────────────┐
│  Sidebar（左侧边栏，桌面可调宽 200~480px，默认 260px / 移动端抽屉）     │
│  ┌────────────────────┐ ┌──────────────────────────────────────────┐│
│  │ [+ 新对话]          │ │  Topbar：模型选择器 [DeepSeek-V4 Flash ▾]  ││
│  │ ─────────────────   │ │          会话标题（可点击重命名）           ││
│  │ 会话列表            │ │──────────────────────────────────────────││
│  │  · 会话1            │ │  MessageList（消息流，居中 max-w-3xl）      ││
│  │  · 会话2            │ │   [用户消息 右对齐气泡]                     ││
│  │  · …（搜索框）       │ │   [助手消息 左对齐整宽 + 思考/引用/正文]      ││
│  │                     │ │──────────────────────────────────────────││
│  │ 用户菜单（设置/关于/ │ │  ChatInput（底部输入区，居中 max-w-3xl）     ││
│  │ 导出/导入）          │ │  [多行输入框] [深度思考] [联网搜索] [发送]    ││
│  └────────────────────┘ │┘ 右缘拖拽手柄（桌面，调整宽度 / 收起入口）     │
└────────────────────────────────────────────────────────────────────┘
```

### 1.1 两种主视图

| 视图 | 触发 | 内容 |
|---|---|---|
| 欢迎视图 | 无消息的新会话 | 居中 Logo + 「我是 DeepSeek，很高兴见到你！」+ 4 个推荐问题卡片（静态文案，点击填入输入框并发送） |
| 对话视图 | 会话有 ≥1 条消息 | 消息流 + 输入区；顶部显示会话标题 |

## 2. 组件树

```
app/page.tsx（客户端）
└── <ChatShell>
    ├── <Sidebar>                      // 桌面常驻 / 移动端 Drawer
    │   ├── <NewChatButton />          // 「+ 新对话」
    │   ├── <ConversationSearch />     // 会话搜索框（过滤列表）
    │   ├── <ConversationList />       // 按 updatedAt 倒序；当前项高亮
    │   │   └── <ConversationItem />   // 标题 + 删除(×)；双击/菜单重命名
    │   └── <UserMenu />               // 头像/菜单：设置、深色模式切换、导出数据、导入数据
    ├── <Topbar>
    │   ├── <ModelSelect />            // 下拉：DeepSeek-V4 Flash / DeepSeek-V4 Pro
    │   ├── <PromptBadge />            // System Prompt 只读标识（已锁定会话）/「更换」入口（空会话）
    │   └── <ConversationTitle />      // 可点击重命名
    ├── <ChatView>
    │   ├── <WelcomeView /> 或 <MessageList>
    │   │   ├── <MessageItem>              // memo 化：流式 delta 仅目标消息重渲染（FR-13）
    │   │   │   ├── <UserMessage>              // 右对齐气泡 + 编辑入口（编辑态 textarea，FR-12）
    │   │   │   └── <AssistantBlock>
    │   │           ├── <ReasoningPanel />  // 思考（可折叠）
    │   │           ├── <WebSearchStatus /> // 搜索状态/引用
    │   │           ├── <Markdown />        // 正文渲染
    │   │           ├── <MessageActions />  // 复制/重新生成（创建分支）/停止
    │   │           └── <UsageLine />       // token 用量（含缓存命中）
    │   │   └── <BranchSwitcher />      // 分支切换行（父消息有多个子分支时，FR-12）
    │   └── <ChatInput>
    │       ├── <Textarea autoResize>       // 多行，Enter 发送
    │       ├── <ThinkingToggle />          // 深度思考开关（含强度长按/菜单）
    │       ├── <WebSearchToggle />         // 联网搜索开关
    │       ├── <ContextSizeLabel />        // 发送按钮左侧：上下文大小（悬浮显示上一轮用量）
    │       └── <SendButton /> / <StopButton />
    └── <SettingsDialog>（Modal）    // 设置表单（见 settings.md）；「管理 System Prompt 库…」按钮打开独立弹窗

独立弹窗：
├── <PromptLibraryDialog>（Modal，860px 双栏）// System Prompt 库管理（见 prompt-library.md 第 4.3 节）
│   ├── 左栏 <PromptCardList />       // 条目卡片（内置置顶 + 默认星标 + hover 编辑/删除/设默认）
│   │   └── 「新建 System Prompt」按钮
│   └── 右栏 <PromptEditor />         // 名称输入 + 内容 textarea + 保存（内置只读）
└── <PromptSelectDialog>（新会话选择器）// 欢迎视图卡片/顶栏入口弹出（见 prompt-library.md 第 4.1 节）
```

## 3. 视觉规范

### 3.1 配色（参考 DeepSeek 网页端）

| 令牌 | 亮色 | 暗色 | 用途 |
|---|---|---|---|
| `--background` | `#FFFFFF` | `#1E1E1E`（近似） | 页面背景 |
| `--sidebar-bg` | `#F7F7F8` | `#262627` | 边栏背景 |
| `--primary` | `#4D6BFE` | `#6B7FFF` | 主色：按钮、链接、选中态 |
| `--user-bubble` | `#F7F7F8` | `#303030` | 用户消息气泡 |
| `--text` | `#1F1F1F` | `#ECECEC` | 正文 |
| `--text-secondary` | `#8E8E8E` | `#A0A0A0` | 次要文字（用量、时间） |
| `--border` | `#E5E5E5` | `#3F3F3F` | 边框、分隔线 |
| `--reasoning-bg` | `#F7F7F8` | `#2A2A2B` | 思考面板背景 |

实现：CSS 变量定义在 `globals.css`，`html.dark` 下切换；Tailwind 通过 `hsl(var(--xxx))` 引用，兼容 shadcn/ui 主题体系。

### 3.2 尺寸与字体

- 主内容区 `max-width: 768px`（`max-w-3xl`）居中；消息流上下 `py-6`
- 字号：正文 15px / 1.7 行高；代码块 13.5px
- 字体栈：`Inter` / 系统中文字体（`-apple-system, "PingFang SC", "Microsoft YaHei"`）
- 圆角（整体加大，标准档位）：按钮 8px（`rounded-lg`）；消息气泡 / 输入区容器 / 对话框 / 卡片 16px（`rounded-2xl`）；浮层菜单（下拉/选择/Tooltip）12px（`rounded-xl`）；胶囊类交互件（开关胶囊、分支胶囊、toast、头像）`rounded-full`；`rounded-sm` 仅用于内联小控件（重命名输入框等），不再用于主要交互件
- 边栏宽可调（默认 260px，范围 200~480px）；顶栏高 56px

### 3.3 图标

- lucide-react：`Plus`（新对话）、`Search`、`Settings`、`Moon/Sun`、`Send`、`Square`（停止）、`Copy`、`RefreshCw`（重试）、`Globe`（联网）、`Brain`/`Sparkles`（深度思考）、`ChevronDown`、`X`、`Pencil`（重命名）、`Trash2`、`Menu`（汉堡）、`ChevronsLeft`（收起边栏）、`Download`/`Upload`（导出/导入数据）

### 3.5 自定义滚动条（消息区）

**动机**：浏览器原生滚动条不随主题变色（暗色模式下亮色轨道突兀）。

**实现**：
- 消息区滚动容器（MessageList）加 `custom-scrollbar` 类隐藏原生滚动条（`scrollbar-width: none` + `::-webkit-scrollbar{display:none}`）
- `components/ui/scrollbar.tsx` 提供 `<ScrollBar>`：固定于 ChatShell 主区（消息区 + 输入区）最右侧，**轨道贯穿到页面底部**（`absolute inset-y-0 right-0`，非止于输入框上方）；仅桌面（`md+`）显示，移动端保留原生滚动
- 滑块几何：高度 = `max(40, clientHeight²/scrollHeight)`，位置按 `scrollTop/(scrollHeight-clientHeight)` 比例映射；`scroll` 事件（rAF 节流）与 ResizeObserver（容器 + 内容层）驱动更新
- 交互：滑块可拖动（window 级 mousemove，拖动中禁文本选择）；轨道容器 `pointer-events-none` 保证输入区右缘点击穿透不受影响
- **主题契合**：滑块颜色用主题变量 `bg-foreground/20 hover:bg-foreground/40`，亮/暗模式自动适配
- 通信：`ScrollContainerContext` 注册滚动容器——ChatShell 内容层注册；会话切换过渡为**原位进行**（不重挂载、无覆盖层），滚动条持续绑定同一容器，切换过程不重绑、不闪烁
- **注册用 state 而非 ref**：ChatShell 用 `useState` 保存容器元素并经 `containerEl` prop 传入 `<ScrollBar>`；ScrollBar 的监听 effect 依赖 `containerEl`，容器晚于 ScrollBar 挂载（首条消息、会话切换重挂载）时 effect 会重跑并重新绑定 scroll/ResizeObserver——若用可变 ref 注册，effect 只在挂载时读一次，晚注册的容器永远不会被观察到，滑块不显示

### 3.4 动画规范

动画 token 定义于 `globals.css`（`@theme` 内 `--animate-*`，keyframes 全局），统一时长与缓动；`prefers-reduced-motion: reduce` 时全部关闭：

| token | keyframes | 时长/缓动 | 用途 |
|---|---|---|---|
| `animate-fade-in` / `animate-fade-out` | opacity 0↔1 | 150ms / 120ms ease | 遮罩、Tooltip |
| `animate-zoom-in` / `animate-zoom-out` | opacity + scale(0.95↔1) | 150ms / 120ms ease | Dialog 内容、下拉/选择菜单 |
| `animate-slide-up` / `animate-slide-down` | opacity + translateY(8px↔0) | 200ms / 150ms ease | Toast、会话切换、思考强度面板 |

应用规则：

- **Dialog**（设置、删除确认、导入确认、System Prompt 选择/详情，全部场景）：Overlay `fade`、Content `zoom`；进入/退出动画均由 `data-state` 变体类驱动，Radix Presence 检测到 closed 态动画后延迟卸载（动画播完再移除 DOM），不引入 forceMount（避免未打开时内容常驻挂载）
- **DropdownMenu / Select**：仅进入动画（`data-[state=open]:animate-zoom-in`），配合 Radix popper 的 `translate` 定位类（独立 CSS `translate` 属性，与动画 `transform: scale` 不冲突）
- **Tooltip**：进入 `fade-in`
- **Toast**（导出/导入/保存提示）：进入 `slide-up`
- **思考强度面板**（ChatInput 自绘浮层）：进入 `fade-in` + `slide-up`
- **会话切换（两阶段原位过渡）**：`activeSessionId` 变化时，旧会话内容**在原内容层原位**播放 `fade-out`（120ms，期间 `pointer-events-none`），随后在**同一层**原位切换为新会话内容并播放 `fade-in`（150ms）出现。**关键：切换全程不重挂载内容层/滚动容器**（避免新容器 `scrollTop=0` 导致首帧闪到对话顶部），旧内容淡出时滚动位置原样保持；新内容首帧前（`useLayoutEffect`）已滚到底部。由 ChatShell 维护 `shownId`/`leavingId` 状态机 + 定时器实现；欢迎视图↔对话视图切换同样生效；首次加载不触发过渡

## 4. 关键交互规范

### 4.1 输入区

- 多行 textarea，`rows=1` 自动增高（max 8 行），`Enter` 发送、`Shift+Enter` 换行
- 发送中：输入框禁用、发送按钮变「停止」方块按钮（红色 hover）
- 空内容/仅空白 → 发送按钮禁用
- 未配置 API Key 时点击发送 → 弹出设置对话框并提示（不发请求）
- **上下文大小**：发送按钮左侧显示「上下文 N」（N 为本地估算 token 数，K 缩写如 `1.2K`；口径 = 当前会话路径消息 + System Prompt 快照，与发送前截断预算一致，见 context-cache.md 第 5 节）；鼠标悬浮弹出与当前主题匹配的浮窗（`bg-background + border-border`），展示**上一轮真实用量**：缓存输入 / 非缓存输入 / 输出 / 思考 / 缓存率；无上一轮数据时显示占位文案
- 底部免责小字：「内容由 AI 生成，仅供学习参考」（仿 DeepSeek）

### 4.2 深度思考开关

- 开关位于输入框左侧（仿 DeepSeek：「深度思考」胶囊按钮，激活态主色高亮）
- 激活后点击可展开强度菜单：低 / 高 / 最高（radio 三选一，默认高）
- 状态持久化于设置（新会话沿用）

### 4.3 联网搜索开关

- 开关位于输入框左侧（「联网搜索」胶囊按钮），激活态主色高亮
- 激活后图标旁显示 `Globe` 图标；无强度子选项

### 4.4 模型选择器

- 顶栏居中下拉，选项：`DeepSeek-V4 Flash` / `DeepSeek-V4 Pro`（两者均可正常使用；若未来模型被 `MODEL_SUPPORT` 置为不可用，选中后发送会被拦截提示）
- 切换立即生效；会话保存自己的模型，切换会话恢复各自模型显示

### 4.5 消息流

- 用户消息：右侧气泡，浅灰底、无 Markdown（纯文本保留换行）；hover 显示「编辑」按钮（移动端 focus 时可见），**编辑按钮左侧同时显示该消息的输入时间**（`YYYY-MM-DD HH:mm:ss`，与编辑按钮同组显隐）
- **日期分隔线**：按路径中 user 消息（提问）的本地日期分组，某条 user 消息与前一条 user 消息不在同一天（提问跨到新的一天）时，在该消息上方插入分隔线——左右两条横线 + 中央日期标签（`YYYY年M月D日`，即分隔线以下对话的发生日期）
- 助手消息：左侧整宽，含思考面板/搜索状态/Markdown 正文/操作行/用量行；「重新生成」按钮常显（创建新分支，FR-12）
- 分支切换行：父消息有多个子分支时，在其下方显示各分支摘要胶囊（当前分支主色高亮、可点击切换，FR-12）
- 生成中：正文末尾显示闪烁光标（`▍` 动画）；思考面板实时滚动
- 自动滚动：新内容到达时若用户未上翻则滚到底；用户上翻暂停自动滚动
- 会话切换：切换会话（含欢迎视图↔对话视图）时主内容区原位 `fade-out` → `fade-in`（见 3.4）；切换后滚动位置重置到底部（`useLayoutEffect` 在绘制前完成，新会话首帧即显示底部，无顶部闪烁）
- 会话首条消息的标题自动生成：取用户首条输入前 30 字符（截断加 …）

### 4.6 消息编辑与分支（FR-12）

- 编辑入口：user 消息 hover 显示「编辑」→ 气泡原位展开 textarea（自动增高）+「取消 / 保存并重新生成」
- 保存后：创建新 user 分支（原消息及其后续保留为旧分支），自动开始生成新回复
- 重新生成：assistant 消息操作行常显「重新生成」按钮 → 创建新 assistant 分支，旧分支保留
- 分支切换：分支点下方胶囊行，点击切到该分支末端（最新叶子）；切换后继续发送追加在当前分支
- 流式生成中：编辑/重新生成/切换分支均禁用（与输入区禁用一致）

### 4.7 边栏

- 会话项 hover 显示「导出」（Download 图标，FR-16）与「删除」（Trash 图标，确认弹窗）按钮；标题双击进入重命名（input 内联编辑，Enter 确认 / Esc 取消）
- **会话导出菜单（FR-16）**：点击会话项导出按钮弹出 DropdownMenu（side 朝右），三项：
  - 「导出为 JSON」→ 下载 `deepseek-chat-session-YYYYMMDD-HHmmss.json`（本应用单会话格式，见 session-storage.md 8.3.1）
  - 「导出为 Responses 格式」→ 下载 `<净化标题>-responses-session.json`（OpenAI Responses 格式，8.3.2）
  - 「导出为 Markdown」→ 下载 `<净化标题>-YYYYMMDD-HHmmss.md`（8.3.3）
  - 流式生成中的会话禁用导出（按钮 disabled + title 说明）
- 会话搜索：按标题模糊过滤
- 移动端（<768px）：边栏为抽屉，顶栏汉堡按钮开合，遮罩点击关闭

**桌面端可调宽与收起（FR-14）**：
- 边栏右缘有拖拽手柄（垂直细条，`cursor-col-resize`，`hidden md:block`）：按住拖动实时调整宽度，范围 200~480px（拖动中经 mousemove 即时生效，松手写回设置）
- **拖到底即收起**：拖动中宽度到达最小阈值（200px）时立即收起（`sidebarCollapsed=true`，无需松手）；**但拖拽监听保持挂载**——若用户未松开鼠标往回拖（向右越过阈值），边栏重新展开（`sidebarCollapsed=false`）并继续跟随鼠标调整宽度；只有松手（mouseup）才结束拖拽。收起后宽度保留当前值，展开恢复该宽度（拖拽回拉场景下宽度继续跟随鼠标）
- 收起入口：拖拽手柄上方提供「收起」按钮（ChevronsLeft 图标）；收起后边栏完全隐藏（`-translate-x-full`），顶栏左侧出现汉堡按钮点击展开
- 宽度（`sidebarWidth`）与收起状态（`sidebarCollapsed`）持久化于设置（localStorage，经 useSettingsStore），刷新后恢复
- 移动端抽屉宽度沿用 260px 并限制 `max-w-[85vw]`，不受桌面宽度设置影响
- 拖拽/收起仅改变布局，不触碰会话数据，流式生成中可正常操作

### 4.8 设置入口

- 边栏底部用户菜单（圆形头像占位「D」）→ 下拉：设置 / 切换深色模式 / 导出数据 / 导入数据 / 导入对话…
- **导入对话…（FR-16）**：隐藏 `input[type=file]`（accept `.json,application/json`）→ FileReader 读取 → `detectSessionFormat` 识别格式：
  - 本应用单会话 JSON → 确认对话框（标题、消息数、同 id 将跳过说明）→ 写库（同 id 跳过保留本地）→ toast「已导入会话」（冲突时「跳过 M」）
  - OpenAI Responses 格式 → 确认对话框（标题、消息数、将创建新会话说明）→ 重建为新会话 → toast「已导入为「{标题}」」
  - 全量备份文件（deepseek-chat-backup）→ 明确提示「请使用『导入数据』导入备份文件」，不写入任何数据
  - 非法 JSON / 无法识别格式 / version 不符 → 明确错误提示
  - 导入前若正在流式生成先停止生成；完成后重载会话 store
- 导出数据：将全部会话 + 自定义 System Prompt 库序列化为 JSON（见 session-storage.md 第 8 节），触发浏览器下载，完成后底部 toast「已导出 N 个会话」
- 导入数据：隐藏 `input[type=file]`（accept `.json,application/json`）→ FileReader 解析 → 先弹确认对话框（显示将导入的会话/库条目数，说明同 id 冲突项将跳过）→ 确认后写库 → 重载会话 store → toast「导入 N、跳过 M」；格式/版本不符给出明确错误，不写入任何数据
- 设置对话框：居中 Modal（宽 480px），表单见 settings.md

### 4.9 System Prompt 选择与锁定标识（FR-11）

- **空会话（对话开始前）**：欢迎视图显示当前 System Prompt 卡片（名称 + 内容预览 + 「更换」按钮）；顶栏同位置显示可点击胶囊；两者均弹出 <PromptSelectDialog>（prompt-library.md 第 4.1 节）
- **已锁定（发送首条消息后）**：顶栏胶囊变只读（名称 + 📋 图标），无「更换」按钮；点击胶囊弹出居中对话框展示 System Prompt 全文（可滚动，跟随主题，见 prompt-library.md 第 4.2 节）
- 锁定瞬间（首条消息发送时）UI 同步切换：选择器消失 → 只读胶囊出现

## 5. 空态 / 加载 / 错误状态

| 状态 | 呈现 |
|---|---|
| 无会话 | 边栏显示空态文案「暂无会话」 |
| 生成中 | 消息流内联流式渲染 + 光标动画；输入区禁用 |
| 流中失败 | 已生成内容保留，底部错误条（红/橙）：「生成失败：{message}」+ 重试按钮 |
| 模型不支持 | 输入区上方提示条（琥珀色）：「该模型暂不支持 Responses API，请切换为其他模型」（正常状态下 Flash/Pro 均可用） |

## 6. 可访问性（NFR-7）

- 所有图标按钮带 `aria-label` 与 `title`
- 开关用 role="switch"（shadcn Switch 自带）
- 焦点可见（focus-visible ring）；对话框支持 Esc 关闭、焦点陷阱（Radix Dialog 自带）
- 对比度：正文/背景 ≥ 4.5:1；次要文字 ≥ 3:1

## 7. 实现要点 Checklist

- [ ] globals.css 主题变量 + shadcn/ui 初始化（npx shadcn@latest init）
- [ ] 按组件树拆分组件，各组件 props/state 见 chat-state.md
- [ ] 欢迎视图 4 个推荐问题卡片（静态数据数组）
- [ ] PromptSelectDialog（库选择）与 PromptBadge（锁定只读标识）
- [ ] 移动端抽屉与桌面常驻的响应式实现
- [ ] 深色模式切换（html.dark class + localStorage 持久化；首帧前内联脚本应用，见 settings.md 1.1）
- [ ] 动画（3.4）：Dialog 进出动画、菜单/Tooltip 进入动画、Toast 上滑、思考强度面板、会话切换过渡
- [ ] 边栏拖拽到最小宽度（200px）自动收起（4.7）
- [ ] 自定义滚动条（3.5）：消息区隐藏原生滚动条、主题色滑块、轨道贯穿到页面底部
