"use client";

import * as React from "react";
import {
  Database,
  Eye,
  EyeOff,
  KeyRound,
  MessagesSquare,
  Palette,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { MODELS } from "@/lib/deepseek/models";
import { PromptLibraryDialog } from "@/components/prompt/PromptLibraryDialog";
import { DataSettings } from "@/components/settings/DataSettings";
import {
  getApiKey,
  setApiKey,
  useSettingsStore,
} from "@/lib/store/useSettingsStore";
import { usePromptStore } from "@/lib/store/usePromptStore";
import { closeSettings, openPromptLibrary, useUiStore } from "@/lib/store/ui";
import {
  BUILTIN_PROMPT_ID,
  type ModelId,
  type ThinkingEffort,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/** 左栏宽度范围与默认值（settings.md 第 1 节：分隔线可拖拽，会话内状态不持久化，与库管理弹窗同规则） */
const PANEL_MIN_WIDTH = 200;
const PANEL_MAX_WIDTH = 420;
const PANEL_DEFAULT_WIDTH = 256;

type CategoryId = "account" | "general" | "conversation" | "appearance" | "data";

/** 类别定义（settings.md 第 2 节）：左栏导航顺序即数组顺序 */
const CATEGORIES: {
  id: CategoryId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}[] = [
  { id: "account", label: "账户", icon: KeyRound, description: "API Key 配置" },
  {
    id: "general",
    label: "通用",
    icon: SlidersHorizontal,
    description: "默认模型与默认 System Prompt",
  },
  {
    id: "conversation",
    label: "对话",
    icon: MessagesSquare,
    description: "深度思考、联网搜索与温度",
  },
  { id: "appearance", label: "外观", icon: Palette, description: "深色模式" },
  {
    id: "data",
    label: "数据",
    icon: Database,
    description: "导出、导入与清除本地数据",
  },
];

/**
 * 设置对话框（docs/04-frontend/settings.md，FR-17）：
 * - 双栏弹窗，尺寸与 System Prompt 库管理弹窗一致（88vw/1080px 宽，内容区 min(78vh,760px)）
 * - 左栏：类别导航（账户/通用/对话/外观/数据），右缘分隔线可拖拽（200~420px，默认 256）
 * - 右栏：当前类别条目 + 底部「取消/保存」操作条
 * - 草稿语义：表单本地草稿，点「保存」写入 store 并关闭；「取消」丢弃
 * - 数据类别为即时操作（DataSettings）；「管理 System Prompt 库…」打开独立弹窗（挂载于本组件之后）
 */
export function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen);

  // 本地草稿（跨类别共享，切换类别不丢）
  const [apiKey, setApiKeyDraft] = React.useState("");
  const [showKey, setShowKey] = React.useState(false);
  const [defaultModel, setDefaultModel] = React.useState<ModelId>("deepseek-v4-flash");
  const [thinkingEnabled, setThinkingEnabled] = React.useState(true);
  const [thinkingEffort, setThinkingEffort] = React.useState<ThinkingEffort>("high");
  const [webSearchEnabled, setWebSearchEnabled] = React.useState(false);
  const [temperature, setTemperature] = React.useState(1.0);
  const [darkMode, setDarkMode] = React.useState(false);
  const [defaultSystemPromptId, setDefaultSystemPromptId] = React.useState(
    BUILTIN_PROMPT_ID
  );
  const [saved, setSaved] = React.useState(false);
  const saveTimerRef = React.useRef<number | null>(null);
  const prompts = usePromptStore((s) => s.prompts);

  // 当前类别（每次打开默认「账户」，未配置 Key 时聚焦 Key 输入框）
  const [activeCategory, setActiveCategory] = React.useState<CategoryId>("account");
  // 左栏宽度（可拖拽分隔线调整；会话内状态，不持久化）
  const [panelWidth, setPanelWidth] = React.useState(PANEL_DEFAULT_WIDTH);

  // 打开时从 store 载入草稿
  React.useEffect(() => {
    if (open) {
      void usePromptStore.getState().loadPrompts(); // 幂等
      const st = useSettingsStore.getState();
      setApiKeyDraft(getApiKey());
      setDefaultModel(st.defaultModel);
      setThinkingEnabled(st.thinkingEnabled);
      setThinkingEffort(st.thinkingEffort);
      setWebSearchEnabled(st.webSearchEnabled);
      setTemperature(st.temperature);
      setDarkMode(st.darkMode);
      setDefaultSystemPromptId(st.defaultSystemPromptId);
      setActiveCategory("account");
      setSaved(false);
    }
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [open]);

  const handleSave = () => {
    setApiKey(apiKey);
    const st = useSettingsStore.getState();
    st.setDefaultModel(defaultModel);
    st.setThinkingEnabled(thinkingEnabled);
    st.setThinkingEffort(thinkingEffort);
    st.setWebSearchEnabled(webSearchEnabled);
    st.setTemperature(temperature);
    st.setDarkMode(darkMode);
    st.setDefaultSystemPromptId(defaultSystemPromptId);
    closeSettings();
    // 简单 toast 反馈
    setSaved(true);
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => setSaved(false), 2000);
  };

  /** 左栏分隔线拖拽（settings.md 第 1 节）：mousemove 实时调宽，松手结束；范围 200~420px */
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

  const activeCat = CATEGORIES.find((c) => c.id === activeCategory) ?? CATEGORIES[0];

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) closeSettings();
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[min(88vw,1080px)]">
          <DialogHeader className="px-5 pt-4 pb-3">
            <DialogTitle>设置</DialogTitle>
            <DialogDescription>配置 API Key 与应用偏好</DialogDescription>
          </DialogHeader>

          <div className="flex h-[min(78vh,760px)] min-h-[420px]">
            {/* 左栏：类别导航（右缘分隔线可拖拽调宽） */}
            <div
              className="relative flex shrink-0 flex-col border-t border-border"
              style={{ width: panelWidth }}
            >
              <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveCategory(c.id)}
                    aria-pressed={activeCategory === c.id}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                      activeCategory === c.id
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-foreground/80 hover:bg-muted"
                    )}
                  >
                    <c.icon className="size-4 shrink-0" />
                    <span className="truncate">{c.label}</span>
                  </button>
                ))}
              </nav>
              {/* 拖拽分隔线（200~420px，cursor-col-resize；hover 高亮提示） */}
              <div
                className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize rounded transition-colors hover:bg-primary/30 active:bg-primary/30"
                onMouseDown={startResize}
                aria-hidden
                title="拖拽调整宽度"
              />
            </div>

            {/* 右栏：当前类别条目 + 底部操作条 */}
            <div className="flex min-w-0 flex-1 flex-col border-t border-l border-border">
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <h3 className="text-sm font-medium">{activeCat.label}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {activeCat.description}
                </p>

                <div className="mt-5 space-y-5">
                  {activeCategory === "account" && (
                    <AccountFields
                      apiKey={apiKey}
                      showKey={showKey}
                      onChange={setApiKeyDraft}
                      onToggleShowKey={() => setShowKey((v) => !v)}
                    />
                  )}
                  {activeCategory === "general" && (
                    <GeneralFields
                      defaultModel={defaultModel}
                      onDefaultModelChange={setDefaultModel}
                      defaultSystemPromptId={defaultSystemPromptId}
                      onDefaultSystemPromptChange={setDefaultSystemPromptId}
                      prompts={prompts}
                    />
                  )}
                  {activeCategory === "conversation" && (
                    <ConversationFields
                      thinkingEnabled={thinkingEnabled}
                      onThinkingEnabledChange={setThinkingEnabled}
                      thinkingEffort={thinkingEffort}
                      onThinkingEffortChange={setThinkingEffort}
                      webSearchEnabled={webSearchEnabled}
                      onWebSearchEnabledChange={setWebSearchEnabled}
                      temperature={temperature}
                      onTemperatureChange={setTemperature}
                    />
                  )}
                  {activeCategory === "appearance" && (
                    <AppearanceFields
                      darkMode={darkMode}
                      onDarkModeChange={setDarkMode}
                    />
                  )}
                  {activeCategory === "data" && <DataSettings />}
                </div>
              </div>

              {/* 底部操作条（sticky 于右栏底部） */}
              <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
                <Button variant="ghost" onClick={closeSettings}>
                  取消
                </Button>
                <Button onClick={handleSave}>保存</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 保存反馈 toast */}
      {saved && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 animate-slide-up rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          设置已保存
        </div>
      )}

      {/* System Prompt 库管理独立弹窗（prompt-library.md 4.3；挂载在设置对话框之后，
          叠加打开时位于上层） */}
      <PromptLibraryDialog />
    </>
  );
}

/** 账户类别：API Key */
function AccountFields({
  apiKey,
  showKey,
  onChange,
  onToggleShowKey,
}: {
  apiKey: string;
  showKey: boolean;
  onChange: (v: string) => void;
  onToggleShowKey: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="api-key">API Key</Label>
      <div className="relative">
        <input
          id="api-key"
          type={showKey ? "text" : "password"}
          value={apiKey}
          onChange={(e) => onChange(e.target.value)}
          placeholder="sk-..."
          autoFocus={!getApiKey()}
          autoComplete="off"
          spellCheck={false}
          className="h-9 w-full rounded-lg border border-border bg-transparent pr-10 pl-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <button
          type="button"
          onClick={onToggleShowKey}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}
          title={showKey ? "隐藏" : "显示"}
        >
          {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Key 仅保存在浏览器本地，仅发送给你自己的代理服务
      </p>
    </div>
  );
}

/** 通用类别：默认模型 + 默认 System Prompt */
function GeneralFields({
  defaultModel,
  onDefaultModelChange,
  defaultSystemPromptId,
  onDefaultSystemPromptChange,
  prompts,
}: {
  defaultModel: ModelId;
  onDefaultModelChange: (v: ModelId) => void;
  defaultSystemPromptId: string;
  onDefaultSystemPromptChange: (v: string) => void;
  prompts: ReturnType<typeof usePromptStore.getState>["prompts"];
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="default-model" className="shrink-0">
          默认模型
        </Label>
        <Select value={defaultModel} onValueChange={(v) => onDefaultModelChange(v as ModelId)}>
          <SelectTrigger id="default-model" className="w-[190px]" aria-label="默认模型">
            <SelectValue placeholder="选择模型" />
          </SelectTrigger>
          <SelectContent>
            {Object.values(MODELS).map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 默认 System Prompt（FR-11） */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="default-prompt" className="shrink-0">
            默认 System Prompt
          </Label>
          <Select
            value={defaultSystemPromptId}
            onValueChange={onDefaultSystemPromptChange}
          >
            <SelectTrigger
              id="default-prompt"
              className="w-[190px]"
              aria-label="默认 System Prompt"
            >
              <SelectValue placeholder="选择 System Prompt" />
            </SelectTrigger>
            <SelectContent>
              {prompts.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.isBuiltin && "（内置）"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <button
          type="button"
          onClick={openPromptLibrary}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
        >
          管理 System Prompt 库…
        </button>
      </div>
    </>
  );
}

/** 对话类别：深度思考 + 强度、联网搜索、温度 */
function ConversationFields({
  thinkingEnabled,
  onThinkingEnabledChange,
  thinkingEffort,
  onThinkingEffortChange,
  webSearchEnabled,
  onWebSearchEnabledChange,
  temperature,
  onTemperatureChange,
}: {
  thinkingEnabled: boolean;
  onThinkingEnabledChange: (v: boolean) => void;
  thinkingEffort: ThinkingEffort;
  onThinkingEffortChange: (v: ThinkingEffort) => void;
  webSearchEnabled: boolean;
  onWebSearchEnabledChange: (v: boolean) => void;
  temperature: number;
  onTemperatureChange: (v: number) => void;
}) {
  return (
    <>
      {/* 深度思考 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="thinking">深度思考</Label>
          <Switch
            id="thinking"
            checked={thinkingEnabled}
            onCheckedChange={onThinkingEnabledChange}
          />
        </div>
        <div
          className={cn(
            "flex items-center gap-4 transition-opacity",
            !thinkingEnabled && "pointer-events-none opacity-40"
          )}
        >
          <span className="text-sm text-muted-foreground">思考强度</span>
          <div className="flex items-center gap-1">
            {(
              [
                { value: "low", label: "低" },
                { value: "high", label: "高" },
                { value: "max", label: "最高" },
              ] as { value: ThinkingEffort; label: string }[]
            ).map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => onThinkingEffortChange(o.value)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs transition-colors",
                  thinkingEffort === o.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
                aria-pressed={thinkingEffort === o.value}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 联网搜索 */}
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="web-search">联网搜索</Label>
        <Switch
          id="web-search"
          checked={webSearchEnabled}
          onCheckedChange={onWebSearchEnabledChange}
        />
      </div>

      {/* 温度 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="temperature">温度</Label>
          <span className="text-sm text-muted-foreground">
            {temperature.toFixed(1)}
          </span>
        </div>
        <Slider
          id="temperature"
          min={0}
          max={2}
          step={0.1}
          value={[temperature]}
          onValueChange={(v) => onTemperatureChange(v[0] ?? 1)}
        />
        <p className="text-xs text-muted-foreground">思考模式关闭时生效</p>
      </div>
    </>
  );
}

/** 外观类别：深色模式 */
function AppearanceFields({
  darkMode,
  onDarkModeChange,
}: {
  darkMode: boolean;
  onDarkModeChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="dark-mode">深色模式</Label>
        <Switch
          id="dark-mode"
          checked={darkMode}
          onCheckedChange={onDarkModeChange}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        默认跟随系统（亮色）；点「保存」后生效并持久化
      </p>
    </div>
  );
}

export { openSettings } from "@/lib/store/ui";
