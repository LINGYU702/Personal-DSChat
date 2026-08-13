import type { ModelId } from "@/lib/types";

// 模型常量与 Responses API 可用性开关（docs/03-api-integration/responses-api.md 第 2 节）
export const MODELS: Record<
  "flash" | "pro",
  { id: ModelId; label: string }
> = {
  flash: { id: "deepseek-v4-flash", label: "DeepSeek-V4 Flash" },
  pro: { id: "deepseek-v4-pro", label: "DeepSeek-V4 Pro" },
};

// Responses API 支持开关表：Flash/Pro 均已支持；新增模型只需改此处
//（官方开放记录：Pro 于 2026 年 8 月初支持）
export const MODEL_SUPPORT: Record<ModelId, boolean> = {
  "deepseek-v4-flash": true,
  "deepseek-v4-pro": true, // 2026-08 官方开放
};
