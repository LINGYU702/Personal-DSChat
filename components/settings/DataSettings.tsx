"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useChatStore } from "@/lib/store/useChatStore";
import { usePromptStore } from "@/lib/store/usePromptStore";
import { useSettingsStore } from "@/lib/store/useSettingsStore";
import {
  backupFilename,
  importBackup,
  parseBackup,
  serializeBackup,
  type ImportResult,
} from "@/lib/storage/export-import";
import {
  detectSessionFormat,
  importResponsesSession,
  importSessionBackup,
  parseResponsesSessionFile,
  parseSessionBackup,
  type SessionFileKind,
} from "@/lib/storage/session-io";
import { clearAllLocalData } from "@/lib/storage/settings";
import type {
  BackupData,
  ResponsesSessionFile,
  SessionBackupData,
} from "@/lib/types";

/**
 * 设置对话框「数据」类别（docs/04-frontend/settings.md 第 2/3 节、ui-design.md 4.8、FR-15/FR-16）：
 * - 导出数据：全部会话 + 自定义 System Prompt 序列化为 JSON 备份文件下载
 * - 导入数据：文件选择 → 确认对话框（数量 + 同 id 跳过说明）→ 写库 → toast
 * - 导入对话…：文件选择 → 格式识别（本应用单会话 / Responses / 备份）→ 确认对话框 → 导入 → toast
 * - 清除本地数据：二次确认 → 清 IndexedDB + localStorage → 刷新
 * - 均为即时操作（不依赖设置草稿「保存」）；确认对话框挂载在本组件内（叠加于设置对话框之上）
 * - 逻辑迁移自原侧边栏用户菜单（ui-design.md 4.8）
 */
export function DataSettings() {
  // 导出/导入（FR-15）
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = React.useState<{
    data: BackupData;
    filename: string;
  } | null>(null);
  const [importing, setImporting] = React.useState(false);

  // 单会话导入（FR-16）
  const conversationFileInputRef = React.useRef<HTMLInputElement>(null);
  const [pendingSessionImport, setPendingSessionImport] = React.useState<{
    kind: SessionFileKind;
    data: SessionBackupData | ResponsesSessionFile;
    filename: string;
  } | null>(null);
  const [sessionImporting, setSessionImporting] = React.useState(false);

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

  /** 导出数据：全部会话 + 自定义 Prompt → 备份 JSON 下载（FR-15） */
  const handleExport = () => {
    void (async () => {
      await usePromptStore.getState().loadPrompts(); // 幂等：确保库条目已加载
      const allSessions = useChatStore.getState().sessions;
      const prompts = usePromptStore.getState().prompts;
      const json = serializeBackup(allSessions, prompts);
      downloadTextFile(backupFilename(), json);
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

  /** 导入对话：选择文件 → 识别格式 → 确认对话框（备份文件引导走「导入数据」） */
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

  /** 清除本地数据（settings.md 第 4 节）：确认后清 IndexedDB + localStorage 并刷新 */
  const handleClearData = () => {
    if (
      window.confirm(
        "确定清除全部本地数据？会话、System Prompt 库与 API Key 都将被删除且不可恢复。"
      )
    ) {
      void clearAllLocalData().then(() => window.location.reload());
    }
  };

  return (
    <>
      <div className="space-y-3">
        {/* 导出数据（FR-15） */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">导出数据</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              将全部会话与自定义 System Prompt 导出为 JSON 备份文件
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void handleExport()}>
            导出
          </Button>
        </div>

        {/* 导入数据（FR-15） */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">导入数据</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              从备份文件恢复/合并会话与 System Prompt 库；同 id 冲突项跳过（保留本地）
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            导入
          </Button>
        </div>

        {/* 导入对话…（FR-16） */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">导入对话…</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              导入单个会话文件（本应用 JSON 或 OpenAI Responses 格式）
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => conversationFileInputRef.current?.click()}
          >
            导入
          </Button>
        </div>

        {/* 清除本地数据（settings.md 第 4 节） */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">清除本地数据</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              删除全部会话、System Prompt 库与 API Key，不可恢复
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleClearData}>
            清除
          </Button>
        </div>
      </div>

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
