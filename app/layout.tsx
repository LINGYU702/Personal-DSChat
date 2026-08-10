import type { Metadata } from "next";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "DeepSeek Chat",
  description: "仿 DeepSeek 网页端对话应用",
};

/**
 * 首帧前同步应用持久化主题（docs/04-frontend/settings.md 第 1.1 节）：
 * HTML 解析阶段、body 绘制前读取 deepseek-chat.settings 并设置 dark class，
 * 避免「先浅色、后深色」的主题闪烁；解析失败静默回退默认（亮色）。
 */
const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem("deepseek-chat.settings")||"{}");var st=s&&s.state;document.documentElement.classList.toggle("dark",!!(st&&st.darkMode));}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="antialiased">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
