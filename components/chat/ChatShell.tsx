"use client";

import * as React from "react";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { Topbar } from "@/components/chat/Topbar";
import { WelcomeView } from "@/components/chat/WelcomeView";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { ScrollBar, ScrollContainerContext } from "@/components/ui/scrollbar";
import { useChatStore } from "@/lib/store/useChatStore";
import { cn } from "@/lib/utils";

/** 会话内容区：消息流或欢迎视图（按会话渲染，供切换过渡复用） */
function SessionContent({
  sessionId,
  onAsk,
}: {
  sessionId: string | null;
  onAsk: (q: string) => void;
}) {
  const session = useChatStore((s) =>
    s.sessions.find((x) => x.id === sessionId)
  );
  if (!session) return null;
  return session.messages.length > 0 ? (
    <MessageList sessionId={session.id} />
  ) : (
    <WelcomeView onAsk={onAsk} />
  );
}

/**
 * 整体布局（ui-design.md 第 1 节）：
 * Sidebar + 主区（Topbar + ChatView + 输入区）
 */
export function ChatShell() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const loaded = useChatStore((s) => s.loaded);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const sendMessage = useChatStore((s) => s.sendMessage);

  // 会话切换两阶段原位过渡（ui-design.md 3.4/4.5）：
  // activeSessionId 变化 → 内容层原位 fade-out（不重挂载，滚动位置保持，
  // 避免新滚动容器 scrollTop=0 首帧闪到对话顶部），定时器结束后在同一层
  // 原位切换会话内容并 fade-in；首次渲染不触发
  const [shownId, setShownId] = React.useState<string | null>(activeSessionId);
  const [leavingId, setLeavingId] = React.useState<string | null>(null);
  const fadeTimerRef = React.useRef<number | null>(null);
  const skipFirstRef = React.useRef(true);

  React.useEffect(() => {
    if (skipFirstRef.current) {
      skipFirstRef.current = false;
      return;
    }
    if (activeSessionId === shownId) {
      // 过渡期间切回当前会话：取消进行中的切换，避免定时器把 shownId 切到错误会话
      if (fadeTimerRef.current !== null) {
        window.clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
      setLeavingId(null);
      return;
    }
    setLeavingId(shownId);
    if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = window.setTimeout(() => {
      setShownId(activeSessionId);
      setLeavingId(null);
    }, 200);
  }, [activeSessionId, shownId]);

  React.useEffect(
    () => () => {
      if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
    },
    []
  );

  // 自定义滚动条（ui-design.md 3.5）：内容层注册滚动容器，切换过渡原位进行，
  // 滚动条持续绑定同一容器。用 state 而非 ref 持有容器：ScrollBar 的 effect
  // 依赖 containerEl 变化重跑，容器晚挂载（首条消息）时也能绑定监听（见 scrollbar.tsx）
  const [scrollEl, setScrollEl] = React.useState<HTMLDivElement | null>(null);
  const registerScroll = React.useCallback((el: HTMLDivElement | null) => {
    setScrollEl(el);
  }, []);

  const handleAsk = (question: string) => {
    void sendMessage(question);
  };

  // 启动恢复完成前：主题色全屏占位（session-storage.md 第 5 节 / chat-state.md 第 6 节），
  // 不渲染欢迎视图/顶栏/输入区，避免「先空欢迎页、后历史对话」闪烁
  if (!loaded) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-background text-foreground">
        <div
          aria-label="正在恢复对话"
          className="size-5 animate-spin rounded-full border-2 border-border border-t-primary"
        />
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenSidebar={() => setSidebarOpen(true)} />
        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* 内容层：切换过渡原位进行——不重挂载（无 key），旧内容 fade-out 期间
              pointer-events-none，定时器结束后原位切换为新会话并 fade-in（ui-design.md 3.4） */}
          <div
            className={cn(
              "relative min-h-0 flex-1 overflow-hidden",
              leavingId !== null && "pointer-events-none"
            )}
          >
            <div
              className={cn(
                "h-full",
                leavingId !== null ? "animate-fade-out" : "animate-fade-in"
              )}
            >
              <ScrollContainerContext.Provider value={registerScroll}>
                <SessionContent sessionId={shownId} onAsk={handleAsk} />
              </ScrollContainerContext.Provider>
            </div>
          </div>
          <ChatInput />
          {/* 自定义滚动条：轨道贯穿消息区 + 输入区，直达页面底部（ui-design.md 3.5） */}
          <ScrollBar containerEl={scrollEl} />
        </div>
      </div>
      <SettingsDialog />
    </div>
  );
}
