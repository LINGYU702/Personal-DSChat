# System Prompt 库（Prompt Library）

> 定义「会话级 System Prompt」功能：库数据模型、内置基础 Prompt、会话绑定与锁定规则、UI 交互、缓存影响。
> 需求来源：FR-11（见 01-requirements/requirements.md）。本文件是 04-frontend 模块下的专门文档，
> 与 chat-state.md（会话模型）、settings.md（库管理入口）、session-storage.md（持久化）、context-cache.md（前缀冻结）互相引用。

## 1. 功能概述

1. **会话级 System Prompt**：每个会话在「对话开始前」指定自己使用的 System Prompt；**对话开始后（该会话发送第一条用户消息起）锁定，无法更改**。
2. **System Prompt 库**：用户可自行编写、存储、管理多条 System Prompt，供新建会话时选用。
3. **内置基础 Prompt**：系统内置一条基础 System Prompt（不可删除、不可编辑），作为默认选项兜底。

## 2. 数据模型（lib/types.ts 追加）

```ts
export interface SystemPrompt {
  id: string;             // uuid；内置条目固定为 "builtin-default"
  name: string;           // 显示名（库列表中展示）
  content: string;        // 完整 System Prompt 文本（instructions 内容）
  isBuiltin: boolean;     // 内置条目 = true（不可编辑/删除）
  createdAt: number;
  updatedAt: number;
}

// 内置基础 Prompt：代码常量（lib/prompts/builtin.ts），不落库、不可删改
export const BUILTIN_DEFAULT_PROMPT: SystemPrompt = {
  id: "builtin-default",
  name: "基础助手",
  isBuiltin: true,
  content: [
    "你是 DeepSeek 网页版助手，请用简洁、准确、友好的中文回答用户问题。",
    "回答结构清晰，适当使用 Markdown（列表、代码块、表格）组织内容；",
    "涉及代码时给出可直接运行的完整示例；",
    "遇到不确定的信息请如实说明，不要编造。",
  ].join("\n"),
  createdAt: 0,
  updatedAt: 0,
};
```

### Session 扩展字段

```ts
interface Session {
  // ...既有字段
  systemPromptId: string;    // 选用的库条目 id；内置为 "builtin-default"
  systemPromptText: string;  // System Prompt 内容【快照】——首条消息发送时冻结，之后不变
}
```

**快照而非引用**（关键设计）：
- 会话持有的是 `systemPromptText` **内容快照**，不是指向库条目的指针；
- 对话开始后即使库中对应条目被修改/删除，已开始会话的 instructions **不受影响**（前缀缓存稳定，见 context-cache.md 规则 1）；
- `systemPromptId` 仅用于 UI 展示「该会话使用了哪条库条目」；条目被删后展示回退为「自定义」。

## 3. 生命周期与锁定规则（核心）

```
新建会话（空会话，无任何消息）
  ├─ 预选：settings.defaultSystemPromptId 指向的条目（默认内置基础 Prompt）
  ├─ 可更换：欢迎视图/顶栏显示选择器，可切换库中任意条目（含内置）
  └─ 【对话开始】= 该会话发送第一条 user 消息（产生第一次请求）的瞬间
       ├─ 冻结：将当前选中条目的 content 复制进 session.systemPromptText（快照）
       ├─ 锁定：UI 不再提供更换入口，仅显示只读的 System Prompt 名称（点击名称在居中对话框查看全文）
       └─ 此后所有请求的 instructions = 该快照，恒不变
```

**锁定判定（派生，不新增字段）**：`promptLocked = session.messages.some(m => m.role === "user")`。

规则细化：
| # | 规则 |
|---|---|
| 1 | 空会话（无 user 消息）可任意更换 System Prompt，**不影响任何已发送请求**（尚无请求发出） |
| 2 | 首条 user 消息写入消息列表的同时执行冻结（同一原子操作内完成，见 chat-state.md sendMessage 步骤 2/3） |
| 3 | 锁定后：UI 隐藏选择器；`systemPromptText` 快照不再被任何路径修改 |
| 4 | 「重试/重新生成」不改变 System Prompt（快照不变） |
| 5 | 删除库条目不影响已锁定会话（快照独立）；仅影响后续新建会话的可用选项 |
| 6 | 修改库条目不影响已锁定会话；仅影响尚未开始的新会话（重新选择时取最新 content） |
| 7 | 无「不使用 System Prompt」选项：每个会话必有 System Prompt（默认内置基础），保证 instructions 恒有稳定前缀 |

## 4. UI 设计

### 4.1 新会话选择器（对话开始前）

- 位置：欢迎视图（空会话）的 System Prompt 卡片，或顶栏模型选择器旁的下拉（二选一实现，推荐**欢迎视图卡片 + 顶栏下拉**双入口保持一致）
- 呈现：显示当前 System Prompt 名称 + 「更换」按钮；点击弹出库选择弹窗：
  - 条目列表（名称 + 内容预览 2 行省略 + 内置徽标「内置」）
  - 底部「管理 System Prompt 库…」入口（跳转设置库管理）
- 交互：点选即生效（不弹确认，空会话无副作用）；Esc/遮罩关闭

### 4.2 锁定标识（对话开始后）

- 顶栏模型选择器旁显示只读胶囊：`📋 基础助手`（当前 System Prompt 名称）
- 无「更换」按钮；胶囊样式为纯展示（不可点击编辑）
- **点击胶囊**在浏览器中央弹出对话框（Dialog，跟随当前深浅主题）展示 System Prompt 全文，内容区可滚动（`max-h-[60vh] overflow-y-auto`，长文不撑破视口）
- 欢迎视图中的选择卡片在锁定后消失（该视图只存在于空会话）

### 4.3 库管理（独立弹窗，双栏布局）

库管理为**独立弹窗**（`PromptLibraryDialog`，独立于设置对话框；设置对话框与库选择弹窗均提供打开入口），
**左侧 System Prompt 卡片列表 + 右侧文本编辑器**双栏布局：

**布局**：
- 居中弹窗，宽度 ≈ 视口 88%（上限 1080px，接近浏览器页面比例）：`sm:max-w-[min(88vw,1080px)]`
  （注意：必须用 `sm:max-w-*` 覆盖 shadcn DialogContent 默认的 `sm:max-w-lg`（512px），
  否则大屏下弹窗会被收窄到 512px；移动端回退为接近全宽）；内容区高约 `min(78vh,760px)`
- 左栏（默认宽 256px，可滚动）：条目卡片列表 + 底部「新建 System Prompt」按钮
- **左栏右缘为可拖拽分隔线**：`cursor-col-resize`，拖动实时调整左栏宽度，范围 200~420px；
  拖拽状态为会话内状态（不持久化），每次打开弹窗恢复默认 256px
- 右栏（flex-1）：编辑器（标题 + 名称输入 + 内容 textarea + 保存按钮）

**左栏卡片**：
- 内置条目恒置顶（「内置」徽标）；自定义条目按 `updatedAt` 倒序
- 当前默认项显示实心星标；hover 显示操作按钮：编辑（铅笔）、删除（垃圾桶，仅自定义）、设为默认（星标，非默认项）
- 点击卡片 → 选中（高亮边框）+ 右栏加载该条目到编辑器；切换卡片/关闭弹窗**丢弃未保存草稿**（以 store 为准重新加载）

**右栏编辑器**：
- 名称（必填，≤50 字）+ 内容（必填，textarea 多行，≤8000 字）
- **内置条目**：输入禁用 + 提示「内置条目不可编辑」，无保存按钮
- 自定义条目/新建：保存按钮（名称与内容均非空才可用）；保存成功列表即时更新，按钮短暂显示「已保存」
- 新建：左栏底部按钮 → 右栏清空表单（名称/内容空，聚焦名称输入）→ 保存后自动选中新条目

| 操作 | 行为 |
|---|---|
| 创建 | 左栏底部「新建 System Prompt」→ 右栏空表单 → 保存（`createPrompt`） |
| 重命名 | 选中卡片 → 右栏修改名称 → 保存（与编辑同操作，`updatePrompt`） |
| 编辑 | 选中卡片 → 右栏修改名称/内容 → 保存 |
| 删除 | 卡片 hover 删除按钮 → `window.confirm` 二次确认 → 删除；删除当前选中项后回退选中内置条目；删除默认项自动回退 `defaultSystemPromptId` 为内置（store 已处理） |
| 设为默认 | 卡片星标按钮 → `setDefaultSystemPromptId`（内置条目亦可设为默认） |

- 名称冲突：允许重名（id 区分），不强制唯一
- 弹窗开关状态在 `lib/store/ui.ts`（`openPromptLibrary` / `closePromptLibrary`），设置对话框与库选择弹窗两入口共用；打开时确保 `loadPrompts`（幂等）已执行

## 5. 与既有「自定义指令」的关系（迁移）

- **废弃** `settings.systemPrompt`（全局自定义指令）字段，由本功能取代：System Prompt 从「全局一份」升级为「库 + 会话级快照」
- 迁移：旧设置中已填写的 `settings.systemPrompt` 内容在首次升级时自动导入为库中一条自定义条目（name「我的自定义指令」）并设为默认；此后该字段不再读写（session-storage.md 第 4 节）
- 理由：全局自定义指令改动会破坏**所有**会话的前缀缓存；会话级快照 + 锁定把缓存失效面从「全局」收敛到「单个新会话」，是对 FR-7 的强化

## 6. 缓存影响（与 context-cache.md 联动）

- `instructions = session.systemPromptText`（快照），会话内**恒冻结** → 前缀缓存最优（比原全局字段更稳定）
- 规则更新：context-cache.md 第 3 节规则 1 改为「会话内 instructions（= System Prompt 快照）不变；库条目编辑不影响已开始会话」
- 内置基础 Prompt 的 content 作为代码常量，版本迭代时**不得修改已有会话快照**（快照已冻结）；仅影响新建会话

## 7. 边界情况

| 场景 | 行为 |
|---|---|
| 锁定后用户想换 System Prompt | 不支持修改；引导「新建对话并选择其他 System Prompt」（可一键复制当前会话标题/上下文到新会话——可选增强，不做） |
| 删除被引用条目 | 已锁定会话快照不受影响；`settings.defaultSystemPromptId` 指向已删条目时回退 `"builtin-default"` |
| 编辑被引用条目 | 已锁定会话不受影响；空会话重新选择时取最新 content |
| 库为空（全部自定义被删） | 内置条目恒在，默认回退内置，无空态 |
| 新建会话立即发送 | 冻结发生在第一条消息发送瞬间（预选条目生效），无额外步骤 |
| 流式中/停止后 | 锁定状态不变 |

## 8. 实现要点 Checklist

- [ ] `lib/types.ts`：SystemPrompt 类型 + Session 扩展字段
- [ ] `lib/prompts/builtin.ts`：BUILTIN_DEFAULT_PROMPT 常量
- [ ] `lib/storage/db.ts`：新增 `prompts` object store（见 session-storage.md）
- [ ] 前端：PromptSelectDialog（库选择）、PromptLibraryDialog（库管理独立弹窗：左卡片列表 + 右编辑器）、PromptBadge（锁定只读标识）
- [ ] chat-state.md：sendMessage 冻结步骤 + 快照写入
- [ ] 单测：锁定规则（首条 user 消息 → 快照冻结）、删除/编辑条目的快照隔离、默认值回退
