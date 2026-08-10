"use client";

import * as React from "react";

/**
 * 消息区滚动容器注册（docs/04-frontend/ui-design.md 3.5）：
 * MessageList 挂载时把滚动容器元素注册进来，ChatShell 用 useState 持有并经
 * containerEl prop 传入 <ScrollBar>。会话切换过渡的 leaving 覆盖层传 value=null，
 * 保证滚动条只跟随当前显示内容。
 * 注册走 state 而非 ref：容器晚于 ScrollBar 挂载（首条消息、切换会话重挂载）时，
 * ScrollBar 的监听 effect 依赖 containerEl 变化而重跑，重新绑定 scroll/ResizeObserver。
 */
export const ScrollContainerContext = React.createContext<
  ((el: HTMLDivElement | null) => void) | null
>(null);

/** 滑块最小高度（px），内容很长时仍可拖拽 */
const THUMB_MIN_HEIGHT = 40;

/**
 * 与主题契合的自定义滚动条（ui-design.md 3.5）：
 * - 轨道贯穿主区高度（消息区 + 输入区），直达页面底部；md+ 显示
 * - 滑块几何由容器 scrollHeight/clientHeight/scrollTop 计算，scroll（rAF 节流）
 *   与 ResizeObserver（容器 + 内容层）驱动更新
 * - 滑块可拖动（window 级 mousemove）；轨道容器 pointer-events-none，
 *   输入区右缘点击穿透不受影响；颜色用主题变量随亮/暗模式自动适配
 * - containerEl 为 null（无消息区，如欢迎视图）时渲染空轨道，不挂监听
 */
export function ScrollBar({
  containerEl,
}: {
  containerEl: HTMLDivElement | null;
}) {
  const [thumb, setThumb] = React.useState({ h: 0, y: 0, visible: false });
  const rafRef = React.useRef<number | null>(null);

  const update = React.useCallback(() => {
    if (!containerEl) return;
    const { clientHeight, scrollHeight, scrollTop } = containerEl;
    if (scrollHeight <= clientHeight) {
      setThumb({ h: 0, y: 0, visible: false });
      return;
    }
    const h = Math.max(THUMB_MIN_HEIGHT, (clientHeight / scrollHeight) * clientHeight);
    const maxTop = clientHeight - h;
    const y =
      maxTop > 0
        ? (scrollTop / (scrollHeight - clientHeight)) * maxTop
        : 0;
    setThumb({ h, y, visible: true });
  }, [containerEl]);

  // 容器变化（挂载/重挂载/卸载）时重绑定监听并立即刷新滑块
  React.useEffect(() => {
    if (!containerEl) return;
    const onScroll = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        update();
      });
    };
    containerEl.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => update());
    ro.observe(containerEl);
    if (containerEl.firstElementChild) ro.observe(containerEl.firstElementChild);
    update();
    return () => {
      containerEl.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [containerEl, update]);

  // 拖动滑块 → 反向计算 scrollTop
  const startDrag = (e: React.MouseEvent, startThumbY: number) => {
    e.preventDefault();
    if (!containerEl) return;
    const { clientHeight, scrollHeight } = containerEl;
    const h = Math.max(THUMB_MIN_HEIGHT, (clientHeight / scrollHeight) * clientHeight);
    const maxTop = clientHeight - h;
    const maxScroll = scrollHeight - clientHeight;
    if (maxTop <= 0 || maxScroll <= 0) return;
    const startY = e.clientY;
    const onMove = (ev: MouseEvent) => {
      const y = Math.min(maxTop, Math.max(0, startThumbY + (ev.clientY - startY)));
      containerEl.scrollTop = (y / maxTop) * maxScroll;
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-3 md:block"
      aria-hidden
    >
      {thumb.visible && (
        <div
          className="pointer-events-auto absolute right-0.5 w-2 rounded-full bg-foreground/20 transition-colors hover:bg-foreground/40"
          style={{ height: thumb.h, top: thumb.y }}
          onMouseDown={(e) => startDrag(e, thumb.y)}
        />
      )}
    </div>
  );
}
