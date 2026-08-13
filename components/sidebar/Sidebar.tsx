"use client";

import * as React from "react";
import {
  Braces,
  ChevronsLeft,
  Download,
  FileJson,
  FileText,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { getPathMessages, useChatStore } from "@/lib/store/useChatStore";
import { useSettingsStore } from "@/lib/store/useSettingsStore";
import { usePromptStore } from "@/lib/store/usePromptStore";
import { openSettings } from "@/lib/store/ui";
import {
  backupFilename,
  importBackup,
  parseBackup,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  serializeBackup,
  type ImportResult,
} from "@/lib/storage/export-import";
import {
  buildResponsesSessionFile,
  detectSessionFormat,
  importResponsesSession,
  importSessionBackup,
  markdownFilename,
  parseResponsesSessionFile,
  parseSessionBackup,
  responsesSessionFilename,
  sessionBackupFilename,
  sessionToMarkdown,
  serializeSessionBackup,
  type SessionFileKind,
} from "@/lib/storage/session-io";
import type {
  BackupData,
  ResponsesSessionFile,
  Session,
  SessionBackupData,
} from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";

/**
 * 左侧边栏（ui-design.md 4.6/4.7 + FR-14/FR-15）：
 * - 桌面（md+）常驻：宽度可拖拽调整（200~480px，右缘手柄），可完全收起
 *   （sidebarCollapsed，顶栏汉堡按钮展开）；宽度/收起状态持久化于设置
 * - 移动端抽屉（open/onClose 由 page 层控制）
 * - NewChatButton / 搜索框 / ConversationList（updatedAt 倒序、当前高亮、
 *   hover 删除按钮带确认 Dialog、双击标题内联重命名）/ UserMenu
 * - 用户菜单：设置 / 深色模式 / 导出数据 / 导入数据（FR-15）/ 导入对话…（FR-16）
 * - 单会话导出（FR-16）：会话项 hover「导出」按钮 → 三格式菜单（本应用 JSON /
 *   OpenAI Responses 格式 / Markdown）；导入自动识别格式（本应用单会话 / Responses / 备份）
 */
export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const newSession = useChatStore((s) => s.newSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const renameSession = useChatStore((s) => s.renameSession);
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const streaming = useChatStore((s) => s.streaming);
  const sidebarWidth = useSettingsStore((s) => s.sidebarWidth);
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const setSidebarWidth = useSettingsStore((s) => s.setSidebarWidth);
  const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed);

  const [query, setQuery] = React.useState("");
  const [pendingDelete, setPendingDelete] = React.useState<Session | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");

  // 单会话导出/导入（FR-16）
  const [exportMenuId, setExportMenuId] = React.useState<string | null>(null);
  const conversationFileInputRef = React.useRef<HTMLInputElement>(null);
  const [pendingSessionImport, setPendingSessionImport] = React.useState<{
    kind: SessionFileKind;
    data: SessionBackupData | ResponsesSessionFile;
    filename: string;
  } | null>(null);
  const [sessionImporting, setSessionImporting] = React.useState(false);

  // 导出/导入（FR-15）
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = React.useState<{
    data: BackupData;
    filename: string;
  } | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);
  const toastTimerRef = React.useRef<number | null>(null);
  const showToast = React.useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000);
  }, []);
  React.useEffect(
    () => () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    },
    []
  );

  // 过滤 + 按 updatedAt 倒序
  const visibleSessions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions
      .filter((s) => (q ? s.title.toLowerCase().includes(q) : true))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [sessions, query]);

  const startEdit = (session: Session) => {
    setEditingId(session.id);
    setDraft(session.title);
  };

  const commitEdit = () => {
    if (editingId && draft.trim()) {
      renameSession(editingId, draft.trim());
    }
    setEditingId(null);
  };

  const handleNewChat = () => {
    newSession();
    onClose(); // 移动端：新建后收起抽屉
  };

  // ---------- 桌面端拖拽调整宽度（FR-14） ----------

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const finish = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", finish);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    const onMove = (ev: MouseEvent) => {
      const w = startWidth + (ev.clientX - startX);
      // 拖到最小宽度 → 立即收起（ui-design.md 4.7），无需松手；
      // 但拖拽监听保持挂载：未松手往回拖（向右越过阈值）时重新展开并继续跟随鼠标，
      // 只有 mouseup 才结束拖拽
      if (w <= SIDEBAR_MIN_WIDTH) {
        setSidebarCollapsed(true);
        return;
      }
      setSidebarCollapsed(false);
      setSidebarWidth(
        Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, w))
      );
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", finish);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  // ---------- 导出/导入（FR-15） ----------

  const handleExport = () => {
    void (async () => {
      await usePromptStore.getState().loadPrompts(); // 幂等：确保库条目已加载
      const allSessions = useChatStore.getState().sessions;
      const prompts = usePromptStore.getState().prompts;
      const json = serializeBackup(allSessions, prompts);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = backupFilename();
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`已导出 ${allSessions.length} 个会话`);
    })();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重复选择同一文件
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = parseBackup(String(reader.result ?? ""));
        setPendingImport({ data, filename: file.name });
      } catch (err) {
        showToast(err instanceof Error ? err.message : "导入失败，请检查文件");
      }
    };
    reader.onerror = () => showToast("读取文件失败");
    reader.readAsText(file);
  };

  const confirmImport = async () => {
    if (!pendingImport || importing) return;
    setImporting(true);
    try {
      // 流式生成中先停止（FR-15 验收标准），避免导入覆盖进行中状态
      const chatStore = useChatStore.getState();
      if (chatStore.streaming) chatStore.stopStreaming();
      const prevActive = chatStore.activeSessionId;
      const result: ImportResult = await importBackup(pendingImport.data);
      await usePromptStore.getState().loadPrompts(); // 库条目立即可见
      await useChatStore.getState().loadAll(); // 会话立即可见（含迁移/状态归一）
      const st = useChatStore.getState();
      if (prevActive && st.sessions.some((s) => s.id === prevActive)) {
        st.setActiveSession(prevActive);
      }
      setPendingImport(null);
      showToast(
        `导入 ${result.importedSessions} 个会话、${result.importedPrompts} 条 Prompt，跳过 ${result.skippedSessions + result.skippedPrompts} 项`
      );
    } catch {
      showToast("导入失败，请检查文件后重试");
    } finally {
      setImporting(false);
    }
  };

  // ---------- 单会话导出/导入（FR-16） ----------

  /** 触发浏览器下载文本文件 */
  const downloadTextFile = (
    filename: string,
    content: string,
    mime = "application/json"
  ) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  /** 单会话导出：三种格式任选（session-storage.md 8.3），下载后 toast */
  const handleExportSession = (
    session: Session,
    kind: "session" | "responses" | "markdown"
  ) => {
    const pathMessages = getPathMessages(session); // 导出当前活动路径
    if (kind === "session") {
      downloadTextFile(sessionBackupFilename(), serializeSessionBackup(session));
    } else if (kind === "responses") {
      const file = buildResponsesSessionFile(
        session.title,
        session.model,
        session.systemPromptText,
        pathMessages
      );
      downloadTextFile(responsesSessionFilename(session.title), JSON.stringify(file, null, 2));
    } else {
      downloadTextFile(
        markdownFilename(session.title),
        sessionToMarkdown(session, pathMessages),
        "text/markdown;charset=utf-8"
      );
    }
    setExportMenuId(null);
    showToast(`已导出「${session.title}」`);
  };

  /** 单会话导入：选择文件 → 识别格式 → 确认对话框（备份文件引导走「导入数据」） */
  const handleConversationFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重复选择同一文件
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      try {
        const kind = detectSessionFormat(text);
        if (kind === null) {
          showToast("无法识别的文件格式，请选择本应用会话或 OpenAI Responses 格式文件");
          return;
        }
        if (kind === "backup") {
          showToast("该文件是完整备份，请使用「导入数据」导入");
          return;
        }
        const data =
          kind === "session"
            ? parseSessionBackup(text)
            : parseResponsesSessionFile(text);
        setPendingSessionImport({ kind, data, filename: file.name });
      } catch (err) {
        showToast(err instanceof Error ? err.message : "导入失败，请检查文件");
      }
    };
    reader.onerror = () => showToast("读取文件失败");
    reader.readAsText(file);
  };

  /** 单会话导入确认：本应用格式同 id 跳过；Responses 格式重建为新会话 */
  const confirmSessionImport = async () => {
    const pending = pendingSessionImport;
    if (!pending || sessionImporting) return;
    setSessionImporting(true);
    try {
      // 流式生成中先停止（FR-16 验收标准）
      const chatStore = useChatStore.getState();
      if (chatStore.streaming) chatStore.stopStreaming();
      if (pending.kind === "session") {
        const data = pending.data as SessionBackupData;
        const res = await importSessionBackup(data);
        await useChatStore.getState().loadAll();
        showToast(
          res.imported
            ? `已导入会话「${data.session.title}」`
            : "本地已存在同 id 会话，已跳过（保留本地数据）"
        );
      } else {
        const session = await importResponsesSession(
          pending.data as ResponsesSessionFile,
          useSettingsStore.getState().defaultModel
        );
        await useChatStore.getState().loadAll();
        showToast(`已导入为「${session.title}」（${session.messages.length} 条消息）`);
      }
      setPendingSessionImport(null);
    } catch {
      showToast("导入失败，请检查文件后重试");
    } finally {
      setSessionImporting(false);
    }
  };

  return (
    <>
      {/* 移动端遮罩 */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col border-r border-border bg-sidebar",
          // md:relative：桌面流内布局（等同 static）且作为拖拽手柄的定位上下文
          "transition-transform duration-200 md:relative md:z-auto",
          open ? "translate-x-0" : "-translate-x-full",
          // 桌面收起：完全隐藏（FR-14）；移动端抽屉行为不变
          sidebarCollapsed ? "md:hidden" : "md:translate-x-0"
        )}
        style={{ width: sidebarWidth, maxWidth: "85vw" }}
      >
        {/* 新对话 */}
        <div className="p-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 bg-transparent"
            onClick={handleNewChat}
          >
            <Plus className="size-4" />
            新对话
          </Button>
        </div>

        {/* 搜索框 */}
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索会话"
              aria-label="搜索会话"
              className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>
        </div>

        {/* 会话列表 */}
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {visibleSessions.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              暂无会话
            </p>
          ) : (
            <ul className="space-y-0.5">
              {visibleSessions.map((session) => {
                const isActive = session.id === activeSessionId;
                const isEditing = session.id === editingId;
                return (
                  <li
                    key={session.id}
                    className={cn(
                      "group flex items-center gap-1 rounded-xl px-2 py-2 transition-colors",
                      isActive
                        ? "bg-muted"
                        : "hover:bg-muted/60"
                    )}
                  >
                    {isEditing ? (
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        aria-label="重命名会话"
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSession(session.id);
                            onClose();
                          }}
                          onDoubleClick={() => startEdit(session)}
                          className="min-w-0 flex-1 truncate text-left text-sm text-foreground/90"
                          title={session.title}
                        >
                          {session.title}
                        </button>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatTime(session.updatedAt)}
                        </span>
                        {/* 单会话导出（FR-16）：hover 显示；流式中的当前会话禁用 */}
                        <DropdownMenu
                          open={exportMenuId === session.id}
                          onOpenChange={(o) => setExportMenuId(o ? session.id : null)}
                        >
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              disabled={streaming && session.id === activeSessionId}
                              className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-0"
                              aria-label="导出会话"
                              title={
                                streaming && session.id === activeSessionId
                                  ? "生成中不可导出"
                                  : "导出会话"
                              }
                            >
                              <Download className="size-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent side="right" align="start" className="w-56">
                            <DropdownMenuLabel className="truncate">
                              {session.title}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => handleExportSession(session, "session")}
                            >
                              <FileJson className="size-4" />
                              导出为 JSON（本应用格式）
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => handleExportSession(session, "responses")}
                            >
                              <Braces className="size-4" />
                              导出为 OpenAI Responses 格式
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => handleExportSession(session, "markdown")}
                            >
                              <FileText className="size-4" />
                              导出为 Markdown
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(session)}
                          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 focus:opacity-100 group-hover:opacity-100"
                          aria-label="删除会话"
                          title="删除会话"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        {/* 用户菜单 */}
        <div className="border-t border-border p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted/60"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  D
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">
                  设置与偏好
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-52">
              <DropdownMenuLabel>用户菜单</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={openSettings}>
                <Settings />
                设置
              </DropdownMenuItem>
              <DarkModeMenuItem />
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleExport}>
                <Download />
                导出数据
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                <Upload />
                导入数据
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => conversationFileInputRef.current?.click()}
              >
                <FileText />
                导入对话…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 桌面端：右缘拖拽手柄 + 收起按钮（FR-14） */}
        <div className="absolute inset-y-0 -right-1.5 z-10 hidden w-3 md:block">
          <button
            type="button"
            onClick={() => setSidebarCollapsed(true)}
            className="absolute top-3 right-0 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground"
            aria-label="收起侧边栏"
            title="收起侧边栏"
          >
            <ChevronsLeft className="size-3.5" />
          </button>
          <div
            className="absolute inset-y-0 left-1/2 w-1.5 -translate-x-1/2 cursor-col-resize rounded transition-colors hover:bg-border active:bg-border"
            onMouseDown={startResize}
            aria-hidden
          />
        </div>
      </aside>

      {/* 隐藏的文件选择（导入数据，FR-15） */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleFileSelected}
        aria-hidden
      />

      {/* 隐藏的文件选择（导入对话，FR-16：本应用单会话 JSON / OpenAI Responses 格式） */}
      <input
        ref={conversationFileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleConversationFileSelected}
        aria-hidden
      />

      {/* 删除确认 */}
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>删除会话</DialogTitle>
            <DialogDescription>
              确定要删除「{pendingDelete?.title}」吗？此操作无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setPendingDelete(null)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDelete) deleteSession(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 导入确认（FR-15：先展示将导入的内容与冲突说明，确认后写库） */}
      <Dialog
        open={pendingImport !== null}
        onOpenChange={(o) => {
          if (!o && !importing) setPendingImport(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>导入数据</DialogTitle>
            <DialogDescription>
              「{pendingImport?.filename}」包含 {pendingImport?.data.sessions.length}{" "}
              个会话、{pendingImport?.data.prompts.length} 条 Prompt。
              与本地 id 相同的会话/条目将跳过（保留本地数据）。确认导入？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingImport(null)} disabled={importing}>
              取消
            </Button>
            <Button onClick={confirmImport} disabled={importing}>
              {importing ? "导入中…" : "导入"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 单会话导入确认（FR-16：识别格式后展示标题/消息数/冲突处理，确认后导入） */}
      <Dialog
        open={pendingSessionImport !== null}
        onOpenChange={(o) => {
          if (!o && !sessionImporting) setPendingSessionImport(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>导入对话</DialogTitle>
            <DialogDescription>
              {/* 空值守卫：关闭动画期间内容仍挂载（pendingSessionImport 已置 null），
                  此时渲染空内容而非访问 null.data */}
              {pendingSessionImport ? (
                <>
                  「{pendingSessionImport.filename}」是
                  {pendingSessionImport.kind === "session"
                    ? "本应用导出的单会话文件"
                    : "OpenAI Responses 格式会话"}
                  ，包含{" "}
                  {pendingSessionImport.kind === "session"
                    ? (pendingSessionImport.data as SessionBackupData).session.messages.length
                    : (pendingSessionImport.data as ResponsesSessionFile).items.length}{" "}
                  条消息。
                  {pendingSessionImport.kind === "session"
                    ? `标题「${(pendingSessionImport.data as SessionBackupData).session.title}」；本地已有同 id 会话时将跳过（保留本地数据）。`
                    : `标题「${(pendingSessionImport.data as ResponsesSessionFile).title}」；将作为新会话导入。`}
                  确认导入？
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setPendingSessionImport(null)}
              disabled={sessionImporting}
            >
              取消
            </Button>
            <Button onClick={() => void confirmSessionImport()} disabled={sessionImporting}>
              {sessionImporting ? "导入中…" : "导入"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 操作反馈 toast（与设置页保存提示同款样式；进入动画见 ui-design.md 3.4） */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 animate-slide-up rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}

/** 用户菜单中的深色模式快捷切换 */
function DarkModeMenuItem() {
  const darkMode = useSettingsStore((s) => s.darkMode);
  const toggleDarkMode = useSettingsStore((s) => s.toggleDarkMode);
  return (
    <DropdownMenuItem onSelect={toggleDarkMode}>
      {darkMode ? <Sun /> : <Moon />}
      深色模式 {darkMode ? "开" : "关"}
    </DropdownMenuItem>
  );
}
