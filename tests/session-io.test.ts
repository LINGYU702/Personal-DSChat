import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import {
  buildResponsesSessionFile,
  detectSessionFormat,
  importResponsesSession,
  importSessionBackup,
  markdownFilename,
  parseResponsesSessionFile,
  parseSessionBackup,
  responsesSessionFilename,
  responsesSessionToSession,
  sanitizeFilename,
  serializeSessionBackup,
  sessionToMarkdown,
} from "@/lib/storage/session-io";
import { getAllSessions } from "@/lib/storage/db";
import {
  RESPONSES_SESSION_FORMAT,
  SESSION_FORMAT,
  type ResponsesSessionFile,
  type Session,
  type StoredMessage,
} from "@/lib/types";
import { uuid } from "@/lib/utils";

/**
 * 单会话导出/导入（FR-16，docs/07-implementation/testing.md 单元测试清单 session-io 项）：
 * ① 单会话 JSON roundtrip；② 非法 JSON/format/version 报错；③ Responses 文件 items 与 buildInput 一致；
 * ④ Responses 文件校验；⑤ 消息链重建（reasoning/webSearch 归属）；⑥ title/model 回退；
 * ⑦ Markdown 结构；⑧ 文件名净化；⑨ 格式识别；⑩ 同 id 跳过
 */

function makeMessage(overrides: Partial<StoredMessage> = {}): StoredMessage {
  return {
    id: uuid(),
    role: "user",
    content: "你好",
    status: "completed",
    model: "deepseek-v4-flash",
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  const now = Date.now();
  const user = makeMessage({ id: "u1", content: "你好" });
  const assistant = makeMessage({
    id: "a1",
    role: "assistant",
    content: "你好！",
    parentId: user.id,
    reasoning: "思考中",
    webSearch: { callId: "ws_1", status: "completed" },
    hadToolCall: true,
    usage: { inputTokens: 10, cachedTokens: 5, outputTokens: 8, reasoningTokens: 3 },
  });
  return {
    id: "sess-1",
    title: "测试会话",
    model: "deepseek-v4-flash",
    systemPromptId: "builtin-default",
    systemPromptText: "你是助手",
    messages: [user, assistant],
    activeLeafId: assistant.id,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeResponsesFile(overrides: Partial<ResponsesSessionFile> = {}): ResponsesSessionFile {
  return {
    format: RESPONSES_SESSION_FORMAT,
    version: 1,
    title: "导入测试",
    model: "deepseek-v4-flash",
    instructions: "你是助手",
    exportedAt: 123,
    items: [
      { type: "message", role: "user", content: "你好" },
      { type: "reasoning", id: "r1", content: "思考中" },
      { type: "web_search_call", id: "ws_1" },
      { type: "message", role: "assistant", content: "你好！" },
    ],
    ...overrides,
  };
}

describe("本应用单会话 JSON（格式 A）", () => {
  it("serializeSessionBackup → parseSessionBackup roundtrip 数据一致", () => {
    const session = makeSession();
    const parsed = parseSessionBackup(serializeSessionBackup(session));
    expect(parsed.format).toBe(SESSION_FORMAT);
    expect(parsed.version).toBe(1);
    expect(parsed.session).toEqual(session);
  });

  it("非法 JSON / format 不符 / version 不支持 → 明确报错", () => {
    expect(() => parseSessionBackup("{oops")).toThrow(/不是有效的 JSON/);
    expect(() =>
      parseSessionBackup(JSON.stringify({ format: "deepseek-chat-backup", version: 1, session: makeSession() }))
    ).toThrow(/不是本应用导出的单会话文件/);
    expect(() =>
      parseSessionBackup(JSON.stringify({ format: SESSION_FORMAT, version: 99, session: makeSession() }))
    ).toThrow(/不支持该文件版本/);
    expect(() =>
      parseSessionBackup(JSON.stringify({ format: SESSION_FORMAT, version: 1, session: { id: "x" } }))
    ).toThrow(/会话数据不完整/);
  });

  it("importSessionBackup：写入；同 id 二次导入跳过保留本地", async () => {
    const session = makeSession();
    const data = parseSessionBackup(serializeSessionBackup(session));
    expect((await importSessionBackup(data)).imported).toBe(true);
    expect((await getAllSessions()).length).toBe(1);

    // 同 id：跳过，不覆盖本地
    const modified = { ...session, title: "被修改的标题" };
    const again = parseSessionBackup(serializeSessionBackup(modified));
    expect((await importSessionBackup(again)).imported).toBe(false);
    const stored = await getAllSessions();
    expect(stored.length).toBe(1);
    expect(stored[0].title).toBe("测试会话");
  });
});

describe("OpenAI Responses 格式会话（格式 B）", () => {
  it("buildResponsesSessionFile：items 与 buildInput 一致（含 reasoning / web_search_call 回传）", () => {
    const session = makeSession();
    const file = buildResponsesSessionFile(
      session.title,
      session.model,
      session.systemPromptText,
      session.messages
    );
    expect(file.format).toBe(RESPONSES_SESSION_FORMAT);
    expect(file.title).toBe("测试会话");
    expect(file.items).toEqual([
      { type: "message", role: "user", content: "你好" },
      { type: "reasoning", id: "a1", content: "思考中" },
      { type: "web_search_call", id: "ws_1" },
      { type: "message", role: "assistant", content: "你好！" },
    ]);
  });

  it("parseResponsesSessionFile：非法/缺 items/畸形 item 处理", () => {
    expect(() => parseResponsesSessionFile("nope")).toThrow(/不是有效的 JSON/);
    expect(() =>
      parseResponsesSessionFile(JSON.stringify({ format: "other", version: 1, items: [] }))
    ).toThrow(/不是 OpenAI Responses 格式会话/);
    expect(() =>
      parseResponsesSessionFile(
        JSON.stringify({ format: RESPONSES_SESSION_FORMAT, version: 1 })
      )
    ).toThrow(/缺少 items/);

    // 畸形 item 被过滤，合法 item 保留
    const parsed = parseResponsesSessionFile(
      JSON.stringify({
        format: RESPONSES_SESSION_FORMAT,
        version: 1,
        title: "  ",
        items: [
          { type: "message", role: "user", content: "hi" },
          { type: "function_call", call_id: "x", name: "f", arguments: "{}" },
          { type: "bogus" },
        ],
      })
    );
    expect(parsed.items).toEqual([{ type: "message", role: "user", content: "hi" }]);
    expect(parsed.title).toBe("导入的对话"); // 空白标题回退
  });

  it("responsesSessionToSession：消息链重建（reasoning/webSearch 归属、parentId 链、activeLeafId）", () => {
    const session = responsesSessionToSession(makeResponsesFile(), "deepseek-v4-pro");
    expect(session.title).toBe("导入测试");
    expect(session.model).toBe("deepseek-v4-flash");
    expect(session.systemPromptText).toBe("你是助手");
    expect(session.systemPromptId).toBe("builtin-default");
    expect(session.messages.length).toBe(2);

    const [u, a] = session.messages;
    expect(u.role).toBe("user");
    expect(u.content).toBe("你好");
    expect(u.status).toBe("completed");
    expect(u.parentId).toBeUndefined();
    expect(a.role).toBe("assistant");
    expect(a.reasoning).toBe("思考中");
    expect(a.webSearch).toEqual({ callId: "ws_1", status: "completed" });
    expect(a.hadToolCall).toBe(true);
    expect(a.parentId).toBe(u.id);
    expect(session.activeLeafId).toBe(a.id);
  });

  it("responsesSessionToSession：model/title/instructions 回退；连续 reasoning 合并；system item 跳过", () => {
    const file = makeResponsesFile({
      title: "",
      model: "unknown-model" as Session["model"],
      instructions: undefined,
      items: [
        { type: "message", role: "system", content: "忽略我" },
        { type: "message", role: "user", content: "q" },
        { type: "reasoning", id: "r1", content: "第一段" },
        { type: "reasoning", id: "r2", content: "第二段" },
        { type: "message", role: "assistant", content: "a" },
      ],
    });
    const session = responsesSessionToSession(file, "deepseek-v4-pro");
    expect(session.title).toBe("导入的对话");
    expect(session.model).toBe("deepseek-v4-pro"); // 非法 model → 回退
    expect(session.systemPromptText).toContain("DeepSeek"); // instructions 缺省 → 内置基础 Prompt
    expect(session.messages.length).toBe(2);
    expect(session.messages[1].reasoning).toBe("第一段\n第二段");
  });

  it("importResponsesSession：总是创建新会话，可重复导入", async () => {
    const file = makeResponsesFile();
    const s1 = await importResponsesSession(file, "deepseek-v4-flash");
    const s2 = await importResponsesSession(file, "deepseek-v4-flash");
    expect(s1.id).not.toBe(s2.id);
    expect((await getAllSessions()).length).toBe(2);
  });
});

describe("Markdown（格式 C）", () => {
  it("sessionToMarkdown：标题/元信息/System Prompt/用户/DeepSeek 段落正确", () => {
    const session = makeSession();
    const md = sessionToMarkdown(session, session.messages);
    expect(md).toContain("# 测试会话");
    expect(md).toContain("- 模型：DeepSeek-V4 Flash");
    expect(md).toContain("## System Prompt（已锁定）");
    expect(md).toContain("你是助手");
    expect(md).toContain("## 用户");
    expect(md).toContain("你好");
    expect(md).toContain("## DeepSeek");
    expect(md).toContain("> 深度思考");
    expect(md).toContain("思考中");
    expect(md).toContain("你好！");
    expect(md).toContain("---");
  });

  it("sessionToMarkdown：空会话显示「未开始」，Pro 模型名正确", () => {
    const empty = makeSession({ model: "deepseek-v4-pro", messages: [] });
    const md = sessionToMarkdown(empty, []);
    expect(md).toContain("## System Prompt（未开始）");
    expect(md).toContain("- 模型：DeepSeek-V4 Pro");
  });

  it("markdownFilename / responsesSessionFilename：净化标题 + 后缀", () => {
    expect(markdownFilename("我的 会话", new Date(2026, 7, 13, 21, 30, 0))).toBe(
      "我的 会话-20260813-213000.md"
    );
    expect(responsesSessionFilename("a/b:c")).toBe("a_b_c-responses-session.json");
  });
});

describe("共用函数", () => {
  it("sanitizeFilename：非法字符替换、空白压缩、截断、回退", () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe("a_b_c_d_e_f_g_h_i_j");
    expect(sanitizeFilename("  带   空格  ")).toBe("带 空格");
    expect(sanitizeFilename("x.")).toBe("x");
    expect(sanitizeFilename("x".repeat(80))).toHaveLength(60);
    expect(sanitizeFilename("")).toBe("conversation");
    expect(sanitizeFilename("...")).toBe("conversation");
  });

  it("detectSessionFormat：识别 backup / session / responses / null", () => {
    expect(detectSessionFormat(serializeSessionBackup(makeSession()))).toBe("session");
    expect(detectSessionFormat(JSON.stringify(makeResponsesFile()))).toBe("responses");
    expect(
      detectSessionFormat(JSON.stringify({ format: "deepseek-chat-backup", version: 1, sessions: [], prompts: [] }))
    ).toBe("backup");
    expect(detectSessionFormat("not json")).toBeNull();
    expect(detectSessionFormat(JSON.stringify({ format: "unknown" }))).toBeNull();
    expect(detectSessionFormat(JSON.stringify({}))).toBeNull();
  });
});

beforeEach(async () => {
  // 清空 IndexedDB（fake-indexeddb 跨用例共享，与 export-import.test.ts 同法）
  const sessions = await getAllSessions();
  await Promise.all(
    sessions.map((s) => import("@/lib/storage/db").then((m) => m.deleteSession(s.id)))
  );
});
