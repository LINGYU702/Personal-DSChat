"use client";

import * as React from "react";
import { MessageItem } from "@/components/chat/MessageItem";
import { BranchSwitcher } from "@/components/chat/BranchSwitcher";
import { ScrollContainerContext } from "@/components/ui/scrollbar";
import { getPathMessages, useChatStore } from "@/lib/store/useChatStore";

export interface BranchInfo {
  id: string;
  preview: string;
}

/** 日期分隔线（ui-design.md 4.5）：中央显示该天日期（本地时区 YYYY年M月D日） */
function DayDivider({ ts }: { ts: number }) {
  const d = new Date(ts);
  const label = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  return (
    <div
      className="flex items-center gap-3 py-3"
      role="separator"
      aria-label={label}
    >
      <div className="h-px flex-1 bg-border" />
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * 消息流（ui-design.md 4.5 + FR-12 分支）：
 * - 只渲染当前路径（根 → activeLeafId）上的消息
 * - 自动滚动到底；用户上翻（距底部 > 80px）时暂停自动滚动
 * - 分支数据按拓扑键缓存：流式 delta 不改变拓扑 → childrenByParent 引用稳定，
 *   MessageItem 的 React.memo 得以生效（卡顿修复的关键之一）
 * - sessionId 必填：由 ChatShell 按当前显示会话传入；切换过渡原位进行（不重挂载）
 */
export function MessageList({ sessionId }: { sessionId: string }) {
  const session = useChatStore((s) => s.sessions.find((x) => x.id === sessionId));
  const containerRef = React.useRef<HTMLDivElement>(null);
  const stickToBottom = React.useRef(true);
  // 自定义滚动条注册（ui-design.md 3.5）：注册到 ChatShell 的 ScrollBar
  const registerScroll = React.useContext(ScrollContainerContext);
  const setContainerRef = React.useCallback(
    (el: HTMLDivElement | null) => {
      containerRef.current = el;
      registerScroll?.(el);
    },
    [registerScroll]
  );

  const handleScroll = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  const pathMessages = React.useMemo(
    () => (session ? getPathMessages(session) : []),
    [session]
  );
  const pathIds = React.useMemo(
    () => new Set(pathMessages.map((m) => m.id)),
    [pathMessages]
  );

  // 日期分隔线（ui-design.md 4.5）：按 user 消息（提问）本地日期分组，
  // 与前一条 user 消息跨天时，在该消息上方插线并显示其日期
  const newDayMessageIds = React.useMemo(() => {
    const ids = new Set<string>();
    let lastDay = "";
    for (const m of pathMessages) {
      if (m.role !== "user") continue;
      const d = new Date(m.createdAt);
      const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (day !== lastDay) {
        ids.add(m.id);
        lastDay = day;
      }
    }
    return ids;
  }, [pathMessages]);

  // 拓扑签名：父→子关系序列。delta 不改变拓扑 → 签名不变 → childrenByParent 引用稳定
  const topoKey = React.useMemo(
    () =>
      session
        ? session.messages.map((m) => `${m.parentId ?? ""}->${m.id}`).join("|")
        : "",
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session?.messages]
  );
  const childrenByParent = React.useMemo(() => {
    const map = new Map<string, BranchInfo[]>();
    if (!session) return map;
    for (const m of session.messages) {
      if (!m.parentId) continue;
      const arr = map.get(m.parentId) ?? [];
      arr.push({ id: m.id, preview: m.content.slice(0, 12) });
      map.set(m.parentId, arr);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topoKey]);

  // 滚到底（依赖 pathMessages 引用变化）：useLayoutEffect 在绘制前完成——
  // 会话切换/首挂载时新滚动容器首帧即显示底部，避免先闪到顶部再跳回（ui-design.md 3.4/4.5）；
  // 流式 delta 也同步滚底，无 1 帧滞后
  React.useLayoutEffect(() => {
    const el = containerRef.current;
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [pathMessages]);

  return (
    <div
      ref={setContainerRef}
      onScroll={handleScroll}
      className="h-full custom-scrollbar overflow-y-auto overscroll-contain"
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        {pathMessages.map((m) => {
          const branches = childrenByParent.get(m.id) ?? [];
          const isNewDay = newDayMessageIds.has(m.id);
          return (
            <div key={m.id}>
              {isNewDay && <DayDivider ts={m.createdAt} />}
              <MessageItem message={m} />
              {branches.length > 1 && (
                <BranchSwitcher branches={branches} pathIds={pathIds} />
              )}
            </div>
          );
        })}
        <div className="h-4" />
      </div>
    </div>
  );
}
