# 设置界面与 API Key 管理（Settings）

> 定义设置对话框的布局（左类别导航 + 右条目面板）、字段分类、API Key 的存储与使用安全边界、localStorage schema。
> 本文件是设置的唯一依据；入口迁移与用户菜单功能归并见 ui-design.md 4.8，需求见 requirements.md FR-17。

## 1. 布局与尺寸

设置对话框为**双栏弹窗**，骨架与 System Prompt 库管理弹窗一致（prompt-library.md 4.3）：

- 居中弹窗，宽度 ≈ 视口 88%（上限 1080px）：`sm:max-w-[min(88vw,1080px)]`
  （必须用 `sm:max-w-*` 覆盖 shadcn DialogContent 默认的 `sm:max-w-lg`（512px），
  否则大屏下弹窗会被收窄到 512px；移动端回退为接近全宽）；内容区高约 `min(78vh,760px)`
- **左栏**（默认宽 256px，可滚动）：类别导航列表
- **左栏右缘为可拖拽分隔线**：`cursor-col-resize`，拖动实时调整左栏宽度，范围 200~420px；
  拖拽状态为会话内状态（不持久化），每次打开弹窗恢复默认 256px（与库管理弹窗同规则）
- **右栏**（flex-1）：当前类别的设置条目（可滚动）+ 底部「取消 / 保存」操作条
  （sticky 于右栏底部，边框分隔）
- 顶部 DialogHeader（标题「设置」+ 副标题）；对话框整体结构与库管理弹窗同尺寸

## 2. 类别与条目

| 类别 | 图标 | 条目 |
|---|---|---|
| 账户 | KeyRound | API Key（password 输入 + 明文切换） |
| 通用 | SlidersHorizontal | 默认模型 Select；默认 System Prompt Select +「管理 System Prompt 库…」入口 |
| 对话 | MessagesSquare | 深度思考 Switch + 思考强度（低/高/最高）；联网搜索 Switch；温度 Slider（0~2，步进 0.1） |
| 外观 | Palette | 深色模式 Switch |
| 数据 | Database | 导出数据；导入数据；导入对话…；清除本地数据（均为即时操作，见第 4 节） |

- 打开对话框默认选中「账户」类别（未配置 Key 时聚焦 Key 输入框）
- 会话内切换类别**不丢草稿**（草稿为组件级状态，跨类别共享）
- 侧边栏宽度/收起（`sidebarWidth`/`sidebarCollapsed`）仍由边栏右缘拖拽与收起按钮调整（FR-14），不在对话框中展示

### 2.1 字段说明

| 字段 | 控件 | 默认 | 持久化 key | 说明 |
|---|---|---|---|---|
| API Key | password 输入 + 明文切换（eye 按钮） | 空 | `deepseek-chat.apiKey` | 必填项；保存时 trim |
| 默认模型 | Select（Flash / Pro） | `deepseek-v4-flash` | `settings.defaultModel` | 新建会话的初始模型 |
| 深度思考 | Switch + 强度（低/高/最高） | 开 / 高 | `settings.thinkingEnabled` / `thinkingEffort` | 全局默认，新会话沿用；输入区开关即时覆盖本次 |
| 联网搜索 | Switch | 关 | `settings.webSearchEnabled` | 同上 |
| 温度 | Slider（0~2，步进 0.1） | 1.0 | `settings.temperature` | 思考模式关闭时生效 |
| 默认 System Prompt | Select（库条目选择，内置恒在）+「管理库…」按钮 | 内置基础 Prompt | `settings.defaultSystemPromptId` | 新建会话的预选项；库管理见 prompt-library.md |
| 深色模式 | Switch | 跟随系统（默认亮） | `settings.darkMode` | 快捷切换入口已并入本对话框（ui-design.md 4.8） |
| 侧边栏宽度 / 收起 | 边栏右缘拖拽 + 收起按钮（FR-14） | 260px / 展开 | `settings.sidebarWidth` / `settings.sidebarCollapsed` | 见 ui-design.md 4.7；仅桌面端生效，移动端恒为抽屉 |

### 2.2 深色模式的首帧应用（防主题闪烁）

`darkMode` 持久化于 `deepseek-chat.settings`（zustand persist JSON：`{"state":{"darkMode":…}}`），默认亮色。
persist 的 localStorage 恢复是**异步**的（首帧绘制后的微任务才触发 `onRehydrateStorage` → `applyDarkMode`），
若仅依赖 store，首帧会先以默认亮色渲染、随后才切到上次主题，出现主题闪烁。

**实现约定**：在 `app/layout.tsx` 的 `<head>` 中注入内联脚本（`dangerouslySetInnerHTML`），
在 HTML 解析阶段、body 绘制前**同步**读取 `deepseek-chat.settings` 并应用 `dark` class：

```ts
// 伪代码（内联脚本，IIFE）：
// const s = JSON.parse(localStorage.getItem("deepseek-chat.settings") ?? "{}");
// document.documentElement.classList.toggle("dark", !!(s?.state?.darkMode));
// JSON 解析失败/无数据：静默回退默认（亮色），与 store 默认一致
```

- 主题为纯 CSS class 驱动（globals.css `:root` / `.dark` 变量），parse 阶段加 class 即首帧生效，无闪烁、无第三方依赖。
- 脚本与 store 同源（同一 localStorage key），rehydrate 后值一致；`onRehydrateStorage` 的 `applyDarkMode` 保留（幂等兜底）。
- `<html>` 保留 `suppressHydrationWarning`（class 由脚本先行设置，与 React 首渲不一致属预期）。
- React 侧（page.tsx 等）**不再**重复执行 `classList.toggle`（与脚本/rehydrate 冗余，删除）。

## 3. 设置对话框交互

- 入口：边栏底部「设置与偏好」按钮 → **直接打开设置对话框**（不再有下拉菜单；原下拉中的
  深色模式快捷切换、导出数据、导入数据、导入对话… 全部移入本对话框「外观」/「数据」类别，见 ui-design.md 4.8）；
  未配置 Key 时发送消息 → 自动弹出并聚焦 Key 输入框（默认选中「账户」类别）
- 表单本地草稿，点「保存」才写入 localStorage；「取消」丢弃草稿；保存后 toast「设置已保存」
- **数据类别为即时操作**（不依赖保存）：导出数据/导入数据/导入对话…/清除本地数据 点击即执行，
  与保存草稿互不影响；导入类操作保留确认对话框 + 结果 toast（行为迁移自原侧边栏用户菜单，见 ui-design.md 4.8）
- API Key 校验：非空即保存（不做离线校验）；真实校验发生在首次请求（401 → 错误提示引导回设置）

### 3.1 System Prompt 库管理（独立弹窗）

- 「默认 System Prompt」行旁「管理 System Prompt 库…」按钮打开**独立库管理弹窗**（`PromptLibraryDialog`，不再是设置内嵌面板，见 prompt-library.md 第 4.3 节）
- 弹窗双栏：左栏卡片列表 + 右栏编辑器；新建/重命名/编辑/删除自定义条目、设为默认；内置条目不可编辑/删除
- 删除当前默认条目 → `defaultSystemPromptId` 自动回退 `"builtin-default"`
- 旧版全局「自定义指令」`settings.systemPrompt` 内容：升级时自动导入为库条目「我的自定义指令」并设为默认（一次性迁移，见 session-storage.md 第 4 节）

## 4. API Key 存储与安全边界

### 存储

```ts
// lib/storage/settings.ts
const KEY_API = "deepseek-chat.apiKey";
const KEY_SETTINGS = "deepseek-chat.settings"; // 其余字段 JSON

export const getApiKey = () => localStorage.getItem(KEY_API) ?? "";
export const setApiKey = (k: string) => localStorage.setItem(KEY_API, k.trim());
export const clearApiKey = () => localStorage.removeItem(KEY_API);
```

- Key 与其余设置**分开两个 key** 存储（避免改设置时误覆盖 Key；便于单独清理）。
- 明文存 localStorage（浏览器本地，非加密）。说明：这是本应用既定的产品决策（用户自备 Key、单机使用），XSS 风险由「不渲染原始 HTML」+ CSP 缓解。

### 使用边界（硬性规则）

1. **Key 只流向自有后端代理**：`lib/api/client.ts` 中唯一 fetch 地址为相对路径 `/api/chat`；代码审查禁止出现将 Key 发往其他域名的路径。
2. 后端代理**不落盘、不打日志**（security.md）。
3. Key 不写入 IndexedDB、不进入 URL、不进入错误上报。
4. 清除数据：设置对话框「数据」类别提供「清除本地数据」按钮（清 localStorage + IndexedDB 全部会话 + 刷新）。

## 5. 未配置 Key 的引导

| 场景 | 行为 |
|---|---|
| 点击发送 | 拦截 + 弹设置对话框（默认选中「账户」类别）+ 提示「请先配置 API Key」 |
| 打开应用 | 不弹窗（正常浏览欢迎页/历史会话） |
| 401 响应 | 消息内联错误提示 + 设置入口按钮 |

## 6. 实现要点 Checklist

- [ ] SettingsDialog 组件（Radix Dialog；双栏：左类别导航 + 右条目面板；尺寸与库管理弹窗一致；分隔线可拖拽 200~420px）
- [ ] 类别：账户（API Key）/ 通用（默认模型、默认 System Prompt）/ 对话（深度思考、联网搜索、温度）/ 外观（深色模式）/ 数据（导出、导入、导入对话、清除本地数据）
- [ ] DataSettings 子组件（数据类别即时操作 + 确认对话框 + 隐藏文件输入 + toast；逻辑迁移自 Sidebar 用户菜单）
- [ ] PromptLibraryDialog 独立弹窗（左卡片列表 + 右编辑器，库 CRUD + 设为默认，prompt-library.md 第 4.3 节）
- [ ] useSettingsStore（persist 中间件，`partialize` 排除 apiKey 或单独字段）
- [ ] layout `<head>` 内联脚本首帧前应用持久化主题（第 2.2 节）；page 不重复设置 class
- [ ] apiKey 独立存取函数 + 发送前校验逻辑
- [ ] 默认 System Prompt 选择器 + 删除条目回退内置逻辑
