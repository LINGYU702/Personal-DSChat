"use client";

import * as React from "react";
import { ChatShell } from "@/components/chat/ChatShell";
import { useChatStore } from "@/lib/store/useChatStore";

/**
 * 主页：挂载 ChatShell；启动时恢复会话（loadAll，阶段 5 接 IndexedDB）。
 * 主题不再在此设置：已由 layout 内联脚本首帧前应用 + onRehydrateStorage 幂等兜底
 * （docs/04-frontend/settings.md 第 1.1 节）。
 */
export default function Home() {
  React.useEffect(() => {
    void useChatStore.getState().loadAll();
  }, []);

  return <ChatShell />;
}
