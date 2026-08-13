import {
  BUILTIN_PROMPT_ID,
  RESPONSES_SESSION_FORMAT,
  RESPONSES_SESSION_VERSION,
  SESSION_FORMAT,
  SESSION_VERSION,
  type InputItem,
  type ModelId,
  type ResponsesSessionFile,
  type Session,
  type SessionBackupData,
  type StoredMessage,
} from "@/lib/types";
import { buildInput } from "@/lib/api/build-input";
import { MODEL_SUPPORT, MODELS } from "@/lib/deepseek/models";
import { BUILTIN_DEFAULT_PROMPT } from "@/lib/prompts/builtin";
import { hasSession, isValidSession, timestampPart } from "@/lib/storage/export-import";
import { putSession } from "@/lib/storage/db";
import { formatDateTime, uuid } from "@/lib/utils";

/**
 * 单会话导出/导入（FR-16，docs/06-storage/session-storage.md 8.3）。
 *
 * 三种导出格式：
 * - A 本应用单会话 JSON（SessionBackupData）：完整会话对象，可重新导入（同 id 跳过）
 * - B OpenAI Responses 格式会话（ResponsesSessionFile）：items 与 Responses API input
 *   结构一致（复用 buildInput），可被 OpenAI 兼容工具直接回放
 * - C Markdown：人类可读对话记录（纯展示，不支持导入）
 *
 * 导入：本应用单会话 JSON（同 id 跳过保留本地）与 OpenAI Responses 格式（总是新建会话）。
 * 除写库（importSessionBackup / importResponsesSession）外全部为纯函数，可在 Node 环境单测。
 */

// ---------- 格式 A：本应用单会话 JSON ----------

/** 构建单会话备份对象（深拷贝，避免与 store 共享引用） */
export function buildSessionBackup(session: Session): SessionBackupData {
  return {
    format: SESSION_FORMAT,
    version: SESSION_VERSION,
    exportedAt: Date.now(),
    session: JSON.parse(JSON.stringify(session)) as Session,
  };
}

/** 单会话备份序列化 */
export function serializeSessionBackup(session: Session): string {
  return JSON.stringify(buildSessionBackup(session), null, 2);
}

/** 单会话备份文件名：deepseek-chat-session-YYYYMMDD-HHmmss.json */
export function sessionBackupFilename(date = new Date()): string {
  return `deepseek-chat-session-${timestampPart(date)}.json`;
}

/** 解析并校验本应用单会话 JSON。非法格式/版本抛带可读文案的 Error（不写入任何数据） */
export function parseSessionBackup(json: string): SessionBackupData {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("文件不是有效的 JSON，无法导入");
  }
  if (!raw || typeof raw !== "object") {
    throw new Error("会话文件格式不正确");
  }
  const data = raw as Record<string, unknown>;
  if (data.format !== SESSION_FORMAT) {
    throw new Error("该文件不是本应用导出的单会话文件");
  }
  const version = typeof data.version === "number" ? data.version : NaN;
  if (!Number.isInteger(version) || version < 1 || version > SESSION_VERSION) {
    throw new Error(`不支持该文件版本（当前支持 v${SESSION_VERSION}）`);
  }
  if (!isValidSession(data.session)) {
    throw new Error("会话数据不完整，无法导入");
  }
  return {
    format: SESSION_FORMAT,
    version,
    exportedAt: typeof data.exportedAt === "number" ? data.exportedAt : Date.now(),
    session: data.session as Session,
  };
}

/** 导入本应用单会话：同 id 会话跳过、保留本地（不覆盖，与 FR-15 语义一致） */
export async function importSessionBackup(
  data: SessionBackupData
): Promise<{ imported: boolean }> {
  const exists = await hasSession(data.session.id);
  if (exists) return { imported: false };
  await putSession(data.session);
  return { imported: true };
}

// ---------- 格式 B：OpenAI Responses 格式会话 ----------

/**
 * 构建 Responses 格式会话文件。
 * pathMessages 为当前活动路径消息（getPathMessages 结果，由调用方传入以保持纯函数）；
 * items 复用 buildInput —— 与真实请求 input 序列一致（含 reasoning / web_search_call 回传）。
 */
export function buildResponsesSessionFile(
  title: string,
  model: ModelId,
  instructions: string,
  pathMessages: StoredMessage[],
  opts: { createdAt?: number; exportedAt?: number } = {}
): ResponsesSessionFile {
  return {
    format: RESPONSES_SESSION_FORMAT,
    version: RESPONSES_SESSION_VERSION,
    title,
    model,
    instructions,
    createdAt: opts.createdAt,
    exportedAt: opts.exportedAt ?? Date.now(),
    items: buildInput(pathMessages),
  };
}

/** Responses 格式文件名：<净化标题>-responses-session.json */
export function responsesSessionFilename(title: string): string {
  return `${sanitizeFilename(title)}-responses-session.json`;
}

/** 最小字段校验：一条可导入的 input item（无法识别的类型导入时跳过） */
function isValidInputItem(v: unknown): v is InputItem {
  if (!v || typeof v !== "object") return false;
  const it = v as Record<string, unknown>;
  if (it.type === "message") {
    return (
      (it.role === "user" || it.role === "assistant" || it.role === "system") &&
      typeof it.content === "string"
    );
  }
  if (it.type === "reasoning") {
    return typeof it.content === "string";
  }
  if (it.type === "web_search_call") {
    return typeof it.id === "string";
  }
  return false; // function_call / function_call_output 等预留类型跳过
}

/** 解析并校验 OpenAI Responses 格式会话。非法格式/版本抛带可读文案的 Error */
export function parseResponsesSessionFile(json: string): ResponsesSessionFile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("文件不是有效的 JSON，无法导入");
  }
  if (!raw || typeof raw !== "object") {
    throw new Error("会话文件格式不正确");
  }
  const data = raw as Record<string, unknown>;
  if (data.format !== RESPONSES_SESSION_FORMAT) {
    throw new Error("该文件不是 OpenAI Responses 格式会话");
  }
  const version = typeof data.version === "number" ? data.version : NaN;
  if (!Number.isInteger(version) || version < 1 || version > RESPONSES_SESSION_VERSION) {
    throw new Error(`不支持该文件版本（当前支持 v${RESPONSES_SESSION_VERSION}）`);
  }
  if (!Array.isArray(data.items)) {
    throw new Error("会话文件缺少 items 数据");
  }
  const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : "导入的对话";
  const model = typeof data.model === "string" ? (data.model as ModelId) : ("deepseek-v4-flash" as ModelId);
  const instructions =
    typeof data.instructions === "string" && data.instructions.trim()
      ? data.instructions.trim()
      : undefined;
  return {
    format: RESPONSES_SESSION_FORMAT,
    version,
    title,
    model,
    instructions,
    createdAt: typeof data.createdAt === "number" ? data.createdAt : undefined,
    exportedAt: typeof data.exportedAt === "number" ? data.exportedAt : Date.now(),
    items: data.items.filter(isValidInputItem),
  };
}

/** 模型解析：文件 model 非法或未启用（MODEL_SUPPORT）→ 回退 fallbackModel */
function resolveImportModel(model: ModelId, fallbackModel: ModelId): ModelId {
  if (model !== MODELS.flash.id && model !== MODELS.pro.id) return fallbackModel;
  return MODEL_SUPPORT[model] ? model : fallbackModel;
}

/**
 * Responses 格式会话 → 本应用 Session（总是创建新会话，无冲突语义）。
 * 重建规则（session-storage.md 8.3.2）：
 * - message user/assistant → 对应 StoredMessage（status completed，无 usage）
 * - reasoning → 附加到其后第一条 assistant 消息的 reasoning 字段
 * - web_search_call → 附加到其后第一条 assistant 消息的 webSearch（completed）+ hadToolCall
 * - 其他 item 类型在解析期已过滤
 */
export function responsesSessionToSession(
  file: ResponsesSessionFile,
  fallbackModel: ModelId = "deepseek-v4-flash"
): Session {
  const now = Date.now();
  const model = resolveImportModel(file.model, fallbackModel);

  const messages: StoredMessage[] = [];
  let pendingReasoning: string | null = null;
  let pendingSearchCallId: string | null = null;

  for (const item of file.items) {
    if (item.type === "message") {
      if (item.role === "system") continue; // instructions 由文件 instructions 承载，跳过 system item
      const msg: StoredMessage = {
        id: uuid(),
        role: item.role,
        content: item.content,
        status: "completed",
        model,
        createdAt: now,
      };
      if (item.role === "assistant") {
        if (pendingReasoning !== null) {
          msg.reasoning = pendingReasoning;
          pendingReasoning = null;
        }
        if (pendingSearchCallId !== null) {
          msg.webSearch = { callId: pendingSearchCallId, status: "completed" };
          msg.hadToolCall = true;
          pendingSearchCallId = null;
        }
      }
      messages.push(msg);
      continue;
    }
    if (item.type === "reasoning") {
      // 多条 reasoning 连续出现时合并（外部文件可能无 message 分隔）
      pendingReasoning = pendingReasoning
        ? `${pendingReasoning}\n${item.content}`
        : item.content;
      continue;
    }
    if (item.type === "web_search_call") {
      pendingSearchCallId = item.id;
      continue;
    }
  }

  // 补 parentId 线性链 + activeLeafId（与 migrateSessionGraph 语义一致）
  const chain = messages.map((m, i) =>
    i === 0 ? { ...m, parentId: undefined } : { ...m, parentId: messages[i - 1].id }
  );

  return {
    id: uuid(),
    title: file.title.trim() || "导入的对话",
    model,
    systemPromptId: BUILTIN_PROMPT_ID,
    systemPromptText: file.instructions?.trim() || BUILTIN_DEFAULT_PROMPT.content,
    messages: chain,
    activeLeafId: chain[chain.length - 1]?.id,
    createdAt: file.createdAt ?? now,
    updatedAt: now,
  };
}

/** 导入 Responses 格式会话：重建为 Session 并写库，返回新会话 */
export async function importResponsesSession(
  file: ResponsesSessionFile,
  fallbackModel: ModelId
): Promise<Session> {
  const session = responsesSessionToSession(file, fallbackModel);
  await putSession(session);
  return session;
}

// ---------- 格式 C：Markdown ----------

/** Markdown 文件名：<净化标题>-YYYYMMDD-HHmmss.md */
export function markdownFilename(title: string, date = new Date()): string {
  return `${sanitizeFilename(title)}-${timestampPart(date)}.md`;
}

/**
 * 会话 → Markdown 对话记录（当前活动路径；分支会话导出当前路径消息）。
 * 结构见 session-storage.md 8.3.3：一级标题 + 元信息 + System Prompt 块 + 逐条消息。
 */
export function sessionToMarkdown(session: Session, pathMessages: StoredMessage[]): string {
  const modelLabel = MODELS[session.model === "deepseek-v4-pro" ? "pro" : "flash"].label;
  const locked = pathMessages.some((m) => m.role === "user");

  const blocks: string[] = [];
  blocks.push(`# ${session.title}`);
  blocks.push("");
  blocks.push(`- 模型：${modelLabel}`);
  blocks.push(`- 导出时间：${formatDateTime(session.updatedAt)}`);
  blocks.push("");
  blocks.push(`## System Prompt（${locked ? "已锁定" : "未开始"}）`);
  blocks.push("");
  blocks.push(session.systemPromptText || "(无)");

  for (const m of pathMessages) {
    const parts: string[] = [];
    if (m.role === "user") {
      parts.push("## 用户", "", m.content || "");
    } else {
      parts.push("## DeepSeek");
      if (m.reasoning) {
        parts.push("", "> 深度思考", "", m.reasoning);
      }
      if (m.content) {
        if (m.reasoning) parts.push("", "---", "");
        parts.push("", m.content);
      }
    }
    blocks.push("", "---", "", ...parts);
  }
  blocks.push("");

  return blocks.join("\n");
}

// ---------- 共用：文件名净化 / 格式识别 ----------

/**
 * 文件名字符净化：替换 Windows/Unix 非法字符为 `_`、压缩空白、去首尾点与空格、截断 60 字符。
 * 空串回退 "conversation"。
 */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return cleaned.slice(0, 60) || "conversation";
}

export type SessionFileKind = "backup" | "session" | "responses";

/** 按顶层 format 字段识别文件类型（backup=全量备份 / session=本应用单会话 / responses=OpenAI 格式） */
export function detectSessionFormat(json: string): SessionFileKind | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const format = (raw as { format?: unknown }).format;
  if (format === SESSION_FORMAT) return "session";
  if (format === RESPONSES_SESSION_FORMAT) return "responses";
  if (format === "deepseek-chat-backup") return "backup";
  return null;
}
