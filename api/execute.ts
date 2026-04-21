import type { VercelRequest, VercelResponse } from "@vercel/node";
import { routeToModel, type AITool } from "../lib/router";
import {
  fetchFileContents,
  commitFiles,
  createBranch,
  createPullRequest,
  getDefaultBranch,
  getRepoTree,
} from "../lib/github";
import type { AgentMode } from "../lib/router";

export const config = { maxDuration: 60 };

function resolveRepo(repo: string): string {
  const aliases = process.env.REPO_ALIASES ?? "";
  for (const pair of aliases.split(",")) {
    const [alias, full] = pair.split(":").map((s) => s.trim());
    if (alias && full && alias.toLowerCase() === repo.toLowerCase()) {
      return full;
    }
  }
  return repo;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "error", message: "Method not allowed" });
  }

  const apiKey = Array.isArray(req.headers["x-api-key"])
    ? req.headers["x-api-key"][0]
    : req.headers["x-api-key"];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ status: "error", message: "Unauthorized" });
  }

  let body: {
    prompt?: unknown;
    tool?: unknown;
    repo?: unknown;
    branch?: unknown;
    files?: unknown;
    create_pr?: unknown;
  };
  try {
    body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(req.body);
  } catch {
    return res.status(400).json({ status: "error", message: "Invalid JSON body" });
  }

  const { prompt, tool, repo, branch, files, create_pr } = body;

  if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
    return res
      .status(400)
      .json({ status: "error", message: "prompt is required and must be a non-empty string" });
  }

  const validTools: AITool[] = ["claude", "codex", "copilot"];
  const selectedTool =
    typeof tool === "string" && validTools.includes(tool as AITool)
      ? (tool as AITool)
      : undefined;

  // Resolve alias and validate repo format if provided
  const repoStr = typeof repo === "string" ? resolveRepo(repo) : undefined;
  if (repoStr && !/^[\w.-]+\/[\w.-]+$/.test(repoStr)) {
    return res
      .status(400)
      .json({ status: "error", message: "repo must be in owner/repo format" });
  }

  const branchStr = typeof branch === "string" ? branch : undefined;
  const fileList = Array.isArray(files) ? (files as string[]) : [];
  const createPr = create_pr === true;

  try {
    let resolvedBranch = branchStr;
    let fileContext: { path: string; content: string }[] | undefined;
    let agentMode: AgentMode | undefined;

    if (repoStr) {
      if (!resolvedBranch) {
        resolvedBranch = await getDefaultBranch(repoStr);
      }

      if (fileList.length === 0) {
        // Agent mode: Claude explores the repo and decides which files to change
        const repoTree = await getRepoTree(repoStr, resolvedBranch);
        agentMode = {
          repoTree,
          readFile: (path: string) =>
            fetchFileContents(repoStr, resolvedBranch, [path]).then((f) => f[0]?.content ?? ""),
        };
      } else {
        // Explicit mode: fetch the specified files upfront
        fileContext = await fetchFileContents(repoStr, resolvedBranch, fileList);
      }
    }

    const result = await routeToModel(selectedTool, prompt.trim(), fileContext, agentMode);

    if (result.status !== "success") {
      return res.status(502).json(result);
    }

    // If no repo, return as-is (backward compatible)
    if (!repoStr || !resolvedBranch) {
      return res.status(200).json(result);
    }

    // Commit changed files back to GitHub
    const changedFiles = result.changedFiles ?? [];
    if (changedFiles.length === 0) {
      // AI made no detectable file changes — return result without commit
      return res.status(200).json({ ...result, changedFiles: undefined });
    }

    const commitMessage = prompt.trim().slice(0, 72);

    if (createPr) {
      const prBranch = `ai-changes/${Date.now()}`;
      await createBranch(repoStr, prBranch, resolvedBranch);
      const { commitUrl } = await commitFiles(repoStr, prBranch, commitMessage, changedFiles);
      const { prUrl } = await createPullRequest(
        repoStr,
        prBranch,
        resolvedBranch,
        commitMessage,
        result.summary ?? ""
      );
      return res
        .status(200)
        .json({ status: "success", summary: result.summary, diff: result.diff, commit_url: commitUrl, pr_url: prUrl });
    } else {
      const { commitUrl } = await commitFiles(
        repoStr,
        resolvedBranch,
        commitMessage,
        changedFiles
      );
      return res
        .status(200)
        .json({ status: "success", summary: result.summary, diff: result.diff, commit_url: commitUrl });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[execute]", err);
    return res.status(502).json({ status: "error", message });
  }
}
