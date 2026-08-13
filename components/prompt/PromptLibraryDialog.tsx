"use client";

import * as React from "react";
import { Check, Pencil, Plus, Star, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePromptStore } from "@/lib/store/usePromptStore";
import { useSettingsStore } from "@/lib/store/useSettingsStore";
import { closePromptLibrary, useUiStore } from "@/lib/store/ui";
import type { SystemPrompt } from "@/lib/types";
import { cn } from "@/lib/utils";

/** 左栏宽度范围与默认值（prompt-library.md 4.3：分隔线可拖拽，会话内状态不持久化） */
const PANEL_MIN_WIDTH = 200;
const PANEL_MAX_WIDTH = 420;
const PANEL_DEFAULT_WIDTH = 256;

/**
 * System Prompt 库管理独立弹窗（docs/04-frontend/prompt-library.md 第 4.3 节）：
 * - 弹窗 ≈ 视口 88% 宽（上限 1080px，sm:max-w-* 覆盖 DialogContent 默认 sm:max-w-lg）
 * - 左栏：条目卡片列表（内置恒置顶 + 「内置」徽标 + 默认星标 + hover 编辑/删除/设为默认），
 *   右缘分隔线可拖拽调整宽度（200~420px）
 * - 右栏：编辑器（名称 + 内容 textarea + 保存）；内置条目只读
 * - 完备 CRUD：新建（左栏底部按钮）/ 重命名与编辑（右栏保存）/ 删除（二次确认）/
 *   设为默认（星标）；删除默认项自动回退内置（store 处理）
 * - 入口：设置对话框「管理 System Prompt 库…」与 PromptSelectDialog 底部入口（共用
 *   lib/store/ui.ts 的 openPromptLibrary / closePromptLibrary）
 */
export function PromptLibraryDialog() {
  const open = useUiStore((s) => s.promptLibraryOpen);
  const prompts = usePromptStore((s) => s.prompts);
  const loadPrompts = usePromptStore((s) => s.loadPrompts);
  const createPrompt = usePromptStore((s) => s.createPrompt);
  const updatePrompt = usePromptStore((s) => s.updatePrompt);
  const deletePrompt = usePromptStore((s) => s.deletePrompt);
  const defaultId = useSettingsStore((s) => s.defaultSystemPromptId);
  const setDefaultSystemPromptId = useSettingsStore((s) => s.setDefaultSystemPromptId);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [isNew, setIsNew] = React.useState(false);
  const [draftName, setDraftName] = React.useState("");
  const [draftContent, setDraftContent] = React.useState("");
  const [saved, setSaved] = React.useState(false);
  const saveTimerRef = React.useRef<number | null>(null);
  // 左栏宽度（可拖拽分隔线调整；会话内状态，不持久化）
  const [panelWidth, setPanelWidth] = React.useState(PANEL_DEFAULT_WIDTH);

  const selected = prompts.find((p) => p.id === selectedId);

  // 打开时初始化：加载库（幂等）+ 默认选中当前默认条目（缺省内置）
  React.useEffect(() => {
    if (!open) return;
    void loadPrompts();
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 库异步加载完成后补选（首次打开时 prompts 可能尚未就绪）
  React.useEffect(() => {
    if (!open || isNew) return;
    if (selectedId && prompts.some((p) => p.id === selectedId)) return;
    const st = useSettingsStore.getState();
    const target =
      prompts.find((p) => p.id === st.defaultSystemPromptId) ?? prompts[0];
    if (target) {
      setSelectedId(target.id);
      setDraftName(target.name);
      setDraftContent(target.content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prompts]);

  /** 选中卡片：切换丢弃未保存草稿（以 store 为准重新加载） */
  const handleSelect = (p: SystemPrompt) => {
    setSelectedId(p.id);
    setIsNew(false);
    setDraftName(p.name);
    setDraftContent(p.content);
  };

  const handleNew = () => {
    setSelectedId(null);
    setIsNew(true);
    setDraftName("");
    setDraftContent("");
  };

  const flashSaved = () => {
    setSaved(true);
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => setSaved(false), 1500);
  };

  /** 保存：新建（createPrompt → 选中新条目）或编辑/重命名（updatePrompt） */
  const handleSave = async () => {
    const name = draftName.trim();
    const content = draftContent.trim();
    if (!name || !content || (selected?.isBuiltin ?? false)) return;
    try {
      if (isNew) {
        const created = await createPrompt(name, content);
        setSelectedId(created.id);
        setIsNew(false);
      } else if (selectedId) {
        await updatePrompt(selectedId, name, content);
      }
      flashSaved();
    } catch {
      // 写入失败：保留编辑态供重试
    }
  };

  /** 删除：二次确认；删除当前选中项后回退选中内置 */
  const handleDelete = async (p: SystemPrompt) => {
    if (p.isBuiltin) return;
    if (!window.confirm(`确定删除 System Prompt「${p.name}」？`)) return;
    try {
      await deletePrompt(p.id);
      if (selectedId === p.id) {
        const builtin = usePromptStore.getState().prompts.find((x) => x.isBuiltin);
        if (builtin) handleSelect(builtin);
      }
    } catch {
      // ignore
    }
  };

  const isBuiltinSelected = selected?.isBuiltin ?? false;

  /** 左栏分隔线拖拽（prompt-library.md 4.3）：mousemove 实时调宽，松手结束；范围 200~420px */
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidth;
    const finish = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", finish);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    const onMove = (ev: MouseEvent) => {
      const w = startWidth + (ev.clientX - startX);
      setPanelWidth(Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, w)));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", finish);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  const canSave =
    draftName.trim().length > 0 &&
    draftContent.trim().length > 0 &&
    !isBuiltinSelected;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) closePromptLibrary();
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[min(88vw,1080px)]">
        <DialogHeader className="px-5 pt-4 pb-3">
          <DialogTitle>System Prompt 库</DialogTitle>
          <DialogDescription>
            管理你的 System Prompt 条目；新建会话时可选用，对话开始后锁定
          </DialogDescription>
        </DialogHeader>

        <div className="flex h-[min(78vh,760px)] min-h-[420px]">
          {/* 左栏：条目卡片列表（右缘分隔线可拖拽调宽） */}
          <div
            className="relative flex shrink-0 flex-col border-t border-border"
            style={{ width: panelWidth }}
          >
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
              {prompts.map((p) => {
                const active = selectedId === p.id && !isNew;
                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelect(p)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSelect(p);
                    }}
                    aria-pressed={active}
                    className={cn(
                      "group cursor-pointer rounded-xl border p-2.5 transition-colors",
                      active
                        ? "border-primary/50 bg-primary/5"
                        : "border-border hover:bg-muted/60"
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {p.name}
                      </span>
                      {p.isBuiltin && (
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          内置
                        </span>
                      )}
                      {defaultId === p.id && (
                        <Star
                          className="size-3.5 shrink-0 fill-amber-400 text-amber-400"
                          aria-label="默认"
                        />
                      )}
                      {/* hover 操作：编辑 / 设为默认 / 删除（内置仅展示） */}
                      <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                        {!p.isBuiltin && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelect(p);
                            }}
                            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label={`编辑 ${p.name}`}
                            title="编辑 / 重命名"
                          >
                            <Pencil className="size-3" />
                          </button>
                        )}
                        {defaultId !== p.id && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDefaultSystemPromptId(p.id);
                            }}
                            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label={`设为默认 ${p.name}`}
                            title="设为默认"
                          >
                            <Star className="size-3" />
                          </button>
                        )}
                        {!p.isBuiltin && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDelete(p);
                            }}
                            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                            aria-label={`删除 ${p.name}`}
                            title="删除"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        )}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {p.content}
                    </p>
                  </div>
                );
              })}
            </div>
            {/* 拖拽分隔线（200~420px，cursor-col-resize；hover 高亮提示） */}
            <div
              className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize rounded transition-colors hover:bg-primary/30 active:bg-primary/30"
              onMouseDown={startResize}
              aria-hidden
              title="拖拽调整宽度"
            />

            {/* 新建按钮 */}
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={handleNew}
                className={cn(
                  "flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border",
                  "px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  isNew && "border-primary/50 bg-primary/5 text-primary"
                )}
              >
                <Plus className="size-3.5" />
                新建 System Prompt
              </button>
            </div>
          </div>

          {/* 右栏：文本编辑器 */}
          <div className="flex min-w-0 flex-1 flex-col border-t border-l border-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium">
                {isNew
                  ? "新建 System Prompt"
                  : selected
                    ? `编辑「${selected.name}」`
                    : ""}
              </h3>
              {isBuiltinSelected && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  内置条目不可编辑
                </span>
              )}
            </div>

            <label
              htmlFor="prompt-lib-name"
              className="mb-1 block text-xs text-muted-foreground"
            >
              名称
            </label>
            <input
              id="prompt-lib-name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              disabled={isBuiltinSelected}
              placeholder="名称（必填，≤50 字）"
              maxLength={50}
              className="h-9 w-full rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
            />

            <label
              htmlFor="prompt-lib-content"
              className="mb-1 mt-3 block text-xs text-muted-foreground"
            >
              内容
            </label>
            <textarea
              id="prompt-lib-content"
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              disabled={isBuiltinSelected}
              placeholder="System Prompt 内容（必填，≤8000 字）"
              rows={12}
              maxLength={8000}
              className="min-h-0 w-full flex-1 resize-none rounded-lg border border-border bg-transparent px-2.5 py-2 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
            />

            <div className="mt-3 flex items-center justify-end gap-2">
              {!isNew && selected && (
                <span className="mr-auto text-[11px] text-muted-foreground">
                  修改名称即重命名，保存后生效
                </span>
              )}
              {!isBuiltinSelected && (
                <Button size="sm" disabled={!canSave} onClick={() => void handleSave()}>
                  {saved ? (
                    <>
                      <Check className="size-3.5" /> 已保存
                    </>
                  ) : isNew ? (
                    "创建"
                  ) : (
                    "保存"
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
