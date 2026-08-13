import { create } from "zustand";

/**
 * 全局 UI 标志（模块级 zustand store，避免跨组件回调直接依赖组件模块）。
 * - settingsOpen：设置对话框（useChatStore.sendMessage 未配置 Key 时调用 openSettings()）
 * - promptLibraryOpen：System Prompt 库管理独立弹窗（SettingsDialog 与 PromptSelectDialog
 *   两入口共用，prompt-library.md 第 4.3 节）
 */
interface UiState {
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  promptLibraryOpen: boolean;
  setPromptLibraryOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  promptLibraryOpen: false,
  setPromptLibraryOpen: (open) => set({ promptLibraryOpen: open }),
}));

export function openSettings(): void {
  useUiStore.getState().setSettingsOpen(true);
}

export function closeSettings(): void {
  useUiStore.getState().setSettingsOpen(false);
}

export function openPromptLibrary(): void {
  useUiStore.getState().setPromptLibraryOpen(true);
}

export function closePromptLibrary(): void {
  useUiStore.getState().setPromptLibraryOpen(false);
}
