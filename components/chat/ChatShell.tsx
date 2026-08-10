"use client";

import * as React from "react";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { Topbar } from "@/components/chat/Topbar";
import { WelcomeView } from "@/components/chat/WelcomeView";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { useChatStore } from "@/lib/store/useChatStore";

/**
 * 整体布局（ui-design.md 第 1 节）：
 * Sidebar + 主区（Topbar + ChatView + 输入区）
 */
export function ChatShell() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const loaded = useChatStore((s) => s.loaded);
  const activeSession = useChatStore((s) =>
    s.sessions.find((x) => x.id === s.activeSessionId)
  );
  const sendMessage = useChatStore((s) => s.sendMessage);

  const hasMessages = (activeSession?.messages.length ?? 0) > 0;

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
        <div className="min-h-0 flex-1 overflow-hidden">
          {hasMessages ? (
            <MessageList />
          ) : (
            <WelcomeView onAsk={handleAsk} />
          )}
        </div>
        <ChatInput />
      </div>
      <SettingsDialog />
    </div>
  );
}
