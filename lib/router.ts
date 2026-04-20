import { callClaude } from "./providers/claude";
import { callCodex } from "./providers/codex";
import { callCopilot } from "./providers/copilot";

export type AITool = "claude" | "codex" | "copilot";

export interface RouterResult {
  status: "success" | "error";
  diff?: string;
  summary?: string;
  message?: string;
}

export async function routeToModel(tool: AITool | undefined, prompt: string): Promise<RouterResult> {
  const selected = tool ?? "claude";

  try {
    let result: { diff: string; summary: string };

    switch (selected) {
      case "claude":
        result = await callClaude(prompt);
        break;
      case "copilot":
        result = await callCopilot(prompt);
        break;
      case "codex":
      default:
        result = await callCodex(prompt);
        break;
    }

    return { status: "success", diff: result.diff, summary: result.summary };
  } catch (err) {
    console.error(`[router] ${selected} failed:`, err);
    return { status: "error", message: "AI provider failed" };
  }
}
