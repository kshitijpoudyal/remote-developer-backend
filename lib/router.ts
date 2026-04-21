import { callClaude, runClaudeAgent } from "./providers/claude";
import { callCodex } from "./providers/codex";
import { callCopilot } from "./providers/copilot";
import type { RepoFile } from "./github";

export type AITool = "claude" | "codex" | "copilot";
export type { RepoFile as FileContext };

export interface AgentMode {
  repoTree: string[];
  readFile: (path: string) => Promise<string>;
}

export interface RouterResult {
  status: "success" | "error";
  diff?: string;
  summary?: string;
  message?: string;
  changedFiles?: RepoFile[];
}

export async function routeToModel(
  tool: AITool | undefined,
  prompt: string,
  fileContext?: RepoFile[],
  agentMode?: AgentMode
): Promise<RouterResult> {
  const selected = tool ?? "claude";

  try {
    let result: { diff: string; summary: string; changedFiles?: RepoFile[] };

    if (agentMode && selected === "claude") {
      const agentResult = await runClaudeAgent(prompt, agentMode.repoTree, agentMode.readFile);
      const diff = agentResult.changedFiles.map((f) => `Modified: ${f.path}`).join("\n") || "(no files changed)";
      result = { diff, summary: agentResult.summary, changedFiles: agentResult.changedFiles };
    } else {
      switch (selected) {
        case "claude":
          result = await callClaude(prompt, fileContext);
          break;
        case "copilot":
          result = await callCopilot(prompt);
          break;
        case "codex":
        default:
          result = await callCodex(prompt, fileContext);
          break;
      }
    }

    return {
      status: "success",
      diff: result.diff,
      summary: result.summary,
      changedFiles: result.changedFiles,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[router] ${selected} failed:`, err);
    return { status: "error", message: `AI provider failed: ${detail}` };
  }
}
