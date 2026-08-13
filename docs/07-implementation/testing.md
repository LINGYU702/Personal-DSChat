# 测试方案（Testing）

> 三层测试：自动化单元测试（核心纯函数）、curl 冒烟（后端代理）、端到端手工验收（对照需求验收标准）。

## 1. 测试工具链

| 层 | 工具 | 说明 |
|---|---|---|
| 单元测试 | **Vitest** | 与 Vite/Next 生态契合，快 |
| 组件测试 | **@testing-library/react** + jsdom | Markdown/表单组件 |
| IndexedDB 测试 | **fake-indexeddb** | 内存模拟 IndexedDB |
| 冒烟 | curl / 脚本 | 后端 SSE 验证 |
| 手工验收 | 浏览器（Chrome/Edge） | 按清单执行 |

## 2. 单元测试清单（核心纯函数）

| 模块 | 用例 |
|---|---|
| `build-request.ts` | ① 思考开→`reasoning:{effort:"high"}`；② 思考关→`effort:"none"` 且**不**发送 temperature；③ 思考关+温度→发送 temperature；④ 联网开→`tools:[{type:"web_search"}]`；⑤ 联网关→无 tools；⑥ 最小字段完整（model/instructions/input/stream:true） |
| `build-input.ts` | ① user/assistant 顺序映射；② 无工具轮不插 reasoning；③ 有工具轮（hadToolCall）插 reasoning item；④ web_search.callId 存在时插入 web_search_call item（原 id）；⑤ 截断后顺序正确 |
| `parse-sse.ts` | ① 解析完整流（created→reasoning delta→output delta→completed）断言事件序列；② 跨块边界（事件被 \n\n 切分）解析正确；③ 无 [DONE] 时 EOF 正常结束 |
| `truncate-history.ts` | ① 成对丢弃（user+assistant）；② 不拆 web_search 轮；③ 预算边界（略超预算→截断至安全值）；④ 保留 instructions |
| `token-estimate.ts` | ① estimateTokens 中/英文计数；② `formatTokenCount`（0→"0"、999→"999"、1000→"1K"、1234→"1.2K"、9999→"10K"） |
| `error map` | ① HTTP→code 映射表全量；② context_too_long 特征识别 |
| `settings.ts` | ① 默认值合并；② JSON 损坏回退默认；③ apiKey 独立读写；④ defaultSystemPromptId 指向不存在条目时回退内置；⑤ 旧自定义指令一次性迁移 |
| `db.ts`（fake-indexeddb） | ① put/getAll 倒序；② delete；③ 版本升级不破坏数据；④ prompts store CRUD；⑤ v1→v2 升级保留 sessions |
| `export-import.ts`（FR-15） | ① serializeBackup → parseBackup roundtrip 数据一致；② 非法 JSON / format 不符 / version 不支持 → 明确报错；③ 正常导入写库（会话 + 自定义 prompt）；④ 同 id 冲突跳过保留本地；⑤ 内置 prompt（isBuiltin）不导入；⑥ 畸形条目跳过并计数；⑦ 导出不含内置条目 |
| `session-io.ts`（FR-16，单会话） | ① serializeSessionBackup → parseSessionBackup roundtrip；② 非法 JSON / format / version 不符 → 明确报错；③ buildResponsesSessionFile：items 与 buildInput 一致（含 reasoning / web_search_call 回传）；④ parseResponsesSessionFile 校验；⑤ responsesSessionToSession：message/reasoning/web_search_call 重建消息链（reasoning 与 webSearch 归属其后 assistant）；⑥ responsesSessionToSession：title 缺省「导入的对话」、model 非法回退默认；⑦ sessionToMarkdown 结构（标题/元信息/System Prompt/用户/DeepSeek 段落）；⑧ sanitizeFilename 净化非法字符并截断；⑨ detectSessionFormat 识别 backup/session/responses/null 四类；⑩ 本应用单会话导入同 id 跳过 |
| `prompt-library` 逻辑 | ① 锁定规则：空会话可更换、已有 user 消息后 selectSystemPrompt 为 no-op；② 快照隔离：删除/修改库条目不影响已锁定会话的 systemPromptText；③ usePromptStore 加载 = 内置 + 自定义合并 |
| 组件 | ① CodeBlock 复制按钮（clipboard mock）；② 表格渲染；③ 思考面板折叠/展开；④ 用量行命中率计算；⑤ PromptSelectDialog 选择生效；⑥ PromptBadge 锁定后无「更换」入口；⑦ PromptLibraryDialog 内置条目禁编辑/删除、默认项星标、删除确认、新建/重命名/编辑保存后列表更新 |

## 3. 后端 curl 冒烟

```bash
# 1) 非法 Key → 401 JSON
curl -s -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"sk-invalid","model":"deepseek-v4-flash","instructions":"hi","input":[{"type":"message","role":"user","content":"hello"}]}'
# 期望: {"error":{"code":"invalid_api_key",...}}

# 2) 模型不支持 → 501 JSON
curl -s -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"<KEY>","model":"deepseek-v4-pro","instructions":"hi","input":[{"type":"message","role":"user","content":"hello"}]}'
# 期望: {"error":{"code":"model_not_supported",...}}

# 3) 正常流式（真实 Key）
curl -N -s -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"<KEY>","model":"deepseek-v4-flash","instructions":"你是助手","input":[{"type":"message","role":"user","content":"你好"}],"stream":true,"reasoning":{"effort":"high"}}'
# 期望: data: {...response.created...} ... data: {...response.completed...,"usage":{...}} 结束，无 [DONE]

# 4) 流中断言脚本（node）：统计事件类型序列，断言首事件 created、末事件 completed/incomplete/failed、含 reasoning 与 output_text delta
```

## 4. 前端手工验收清单（对应 requirements.md 验收标准）

> 使用真实 API Key（deepseek-v4-flash），逐项执行打勾。

### 4.1 基础对话
- [ ] FR-1 首屏欢迎视图（Logo/欢迎语/推荐卡片）正确
- [ ] FR-4 发送「你好」→ 思考面板流式展开 → 正文流式输出 → 光标动画 → 完成后思考折叠（显示用时）
- [ ] FR-4 第二轮追问上下文一致（如「我第一句问的什么？」）
- [ ] FR-4 消息尾部用量行显示：输入/缓存命中/输出/思考 token
- [ ] NFR-1 首字符延迟 < 3s

### 4.2 模型与开关
- [ ] FR-2 顶栏切换 Flash/Pro；Pro 发送 → 正常流式对话（已启用，走同一代理链路）；顶栏模型选项无「即将支持」角标
- [ ] FR-2 历史消息保留各自模型标识
- [ ] FR-5 关闭深度思考 → 请求无 reasoning 面板（可经 DevTools 网络面板确认 effort:"none"）
- [ ] FR-5 强度三档生效（低/高/最高在请求中可见）
- [ ] FR-6 开启联网 → 问「今天北京天气」→ 出现「正在搜索网络…」→ 引用角标与来源列表；关闭联网 → 同样问题无搜索状态
- [ ] FR-6 联网 + 思考同时开启正常（思考 → 搜索 → 正文）

### 4.3 设置与 Key
- [ ] FR-3 未配置 Key 发送 → 弹设置；输入 Key 保存后重发成功
- [ ] FR-3 刷新页面 Key 保留
- [ ] FR-3 填错 Key → 内联「API Key 无效」提示
- [ ] FR-8 设置页「清除本地数据」→ 会话与 Key 全清

### 4.4 会话管理
- [ ] FR-9 新建/切换/重命名/删除会话（删除有确认）
- [ ] FR-9 刷新后会话与消息完整恢复，可继续对话
- [ ] FR-9 首条消息后标题自动生成
- [ ] FR-7 连续 5 轮对话，观察第 2 轮起缓存命中率 > 0 且通常 > 90%（用量行）

### 4.5 流式控制与容错
- [ ] 生成中点「停止」→ 立即停止，内容保留，可重试
- [ ] 断网（DevTools offline）→ 错误提示，内容保留
- [ ] 上下文超限（粘贴长文）→ 自动截断重试一次并提示

### 4.6 渲染与样式
- [ ] FR-10 让模型输出含表格/代码块/公式/列表的 Markdown → 全部正确渲染；代码块有语言标签与复制按钮
- [ ] 深色模式切换正常；移动端（DevTools 375px）边栏抽屉可用

### 4.7 System Prompt 库（FR-11）
- [ ] 新建会话默认选中「基础助手」（内置）；空会话经欢迎卡片/顶栏更换条目立即生效
- [ ] 发送首条消息后：选择器消失 → 顶栏只读胶囊出现（tooltip 可见全文）；再次尝试更换无入口
- [ ] 库管理：新建/编辑/删除自定义条目正常；内置条目无编辑/删除按钮；删除有确认
- [ ] 修改某库条目内容 → 已开始会话继续使用旧内容（DevTools 网络面板核对 instructions 未变）
- [ ] 删除默认条目 → 默认自动回退内置；「设为默认」后新建会话预选生效
- [ ] 自定义条目全删后内置仍可用；「清除本地数据」后库清空、内置仍在

### 4.8 侧边栏与数据备份（FR-14 / FR-15）
- [ ] FR-14 桌面端拖动边栏右缘手柄：宽度实时变化，范围 200~480px；松手后刷新页面宽度保持
- [ ] FR-14 点击收起按钮 → 边栏完全隐藏、主区占满；顶栏汉堡按钮点击展开；刷新后收起状态保持
- [ ] FR-14 拖动边栏到最窄自动收起后，**不松开鼠标**往回拖（向右越过 200px）→ 边栏重新显示并继续跟随鼠标；松手后宽度持久化
- [ ] FR-14 移动端（375px）边栏仍为抽屉，宽度 ≤ 85vw，行为与改动前一致
- [ ] FR-15 用户菜单「导出数据」→ 下载 `deepseek-chat-backup-*.json`；打开文件确认含 format/version 字段、全部会话与自定义 Prompt（无内置条目）
- [ ] FR-15 清空本地数据后「导入数据」选择该文件 → 确认框显示将导入的会话/条目数 → 确认后会话出现在边栏、可切换查看，刷新后仍在
- [ ] FR-15 重复导入同一文件 → 提示「导入 0、跳过 N」，本地数据不被覆盖
- [ ] FR-15 导入非本应用 JSON（或损坏文件）→ 明确错误提示，不写入任何数据
- [ ] FR-15 生成中导入 → 先停止生成再导入，界面不崩溃

### 4.9 单会话导出/导入（FR-16）
- [ ] 会话项 hover 出现「导出」按钮 → 弹出三格式菜单；分别下载：`deepseek-chat-session-*.json`、`*-responses-session.json`、`*.md`
- [ ] Responses 格式文件：`format: "openai-responses-session"`；items 含 message/reasoning/web_search_call（联网轮次）；可被任何 OpenAI 兼容客户端作为 input 直接发送
- [ ] Markdown 文件：标题/模型/导出时间/System Prompt/逐条消息正确；含深度思考内容；分支会话导出当前路径
- [ ] 流式生成中：当前流式会话导出按钮禁用，其他会话可导出
- [ ] 用户菜单「导入对话…」导入本应用单会话 JSON → 确认框（标题/消息数）→ 会话出现在边栏可查看；再次导入同文件 → 「跳过」提示，本地不被覆盖
- [ ] 导入 Responses 格式文件 → 确认框（将创建新会话）→ 新会话出现；消息/思考/联网状态还原正确；刷新后仍在
- [ ] 导入全量备份文件 → 提示「请使用『导入数据』导入备份文件」，不写入任何数据
- [ ] 导入非法 JSON / 其他格式文件 → 明确错误提示，不写入任何数据
- [ ] 生成中导入 → 先停止生成再导入，界面不崩溃

## 5. 缓存命中专项验证

```
1. 新建会话，连续问 5 个简单问题（每轮记录用量行）
2. 断言：第 1 轮命中率 ≈ 0（前缀首次落盘）
3. 断言：第 2 轮起命中率 > 0；通常第 3~5 轮 > 90%
4. 若命中率恒为 0：检查 instructions 是否稳定（含时间戳/随机串）、历史是否被改写
```

## 6. 回归策略

- 每次阶段验收后跑 `npm run test`（单元）+ 阶段相关手工项
- 阶段 8 收尾时全量跑本文件 4.x 全部清单
- 依赖升级（openai SDK、Next）后重跑 3.3 与 5 专项

## 7. 已知边界（测试时注意）

- Flash/Pro 均经同一代理链路真实调用；模型不可用性（若未来出现）只测拦截提示（`MODEL_SUPPORT` 置 false 后验证 501 与前端琥珀色提示）
- 缓存命中率受官方「尽力而为」策略影响，偶发低命中（新前缀/缓存过期）属正常
- 浏览器多标签操作同一会话不在支持范围
