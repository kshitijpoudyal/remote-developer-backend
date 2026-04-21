import Anthropic from "@anthropic-ai/sdk";
import type { RepoFile } from "../github";

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

function buildPrompt(prompt: string, fileContext?: RepoFile[]): string {
  if (!fileContext || fileContext.length === 0) {
    return `Apply the following change: ${prompt}.\nReturn ONLY a valid unified git diff.\nDo not include explanations, markdown, or any extra text.`;
  }

  const fileSections = fileContext
    .map((f) => `=== FILE: ${f.path} ===\n${f.content}\n=== END FILE ===`)
    .join("\n\n");

  return `You are given the following files from the repository:\n\n${fileSections}\n\nApply the following change: ${prompt}\n\nReturn the full modified content of each changed file using EXACTLY this format — one block per changed file:\n=== FILE: <path> ===\n<complete new file content>\n=== END FILE ===\n\nDo not include explanations, markdown, diffs, or anything else. Only output file blocks.`;
}

function parseFileBlocks(text: string): RepoFile[] {
  const blocks: RepoFile[] = [];
  const regex = /=== FILE: (.+?) ===\n([\s\S]*?)\n=== END FILE ===/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({ path: match[1].trim(), content: match[2] });
  }
  return blocks;
}

export async function runClaudeAgent(
  prompt: string,
  repoTree: string[],
  readFile: (path: string) => Promise<string>
): Promise<{ changedFiles: RepoFile[]; summary: string }> {
  const tools: Anthropic.Tool[] = [
    {
      name: "read_file",
      description: "Read the contents of a file in the repository.",
      input_schema: {
        type: "object" as const,
        properties: { path: { type: "string", description: "File path relative to repo root" } },
        required: ["path"],
      },
    },
    {
      name: "write_file",
      description: "Write the full new content of a file. Call this for every file you modify.",
      input_schema: {
        type: "object" as const,
        properties: {
          path: { type: "string", description: "File path relative to repo root" },
          content: { type: "string", description: "Complete new file content" },
        },
        required: ["path", "content"],
      },
    },
  ];

  const systemPrompt =
    "You are an autonomous developer with access to a GitHub repository. " +
    "Use read_file to inspect files and write_file to save your changes. " +
    "Only call write_file for files you actually modified. When done, stop calling tools.";

  const treeList = repoTree.join("\n");
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Repository files:\n${treeList}\n\nTask: ${prompt}`,
    },
  ];

  const changedFilesMap = new Map<string, string>();
  const MAX_ITERATIONS = 10;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await getClient().messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") break;

    if (response.stop_reason !== "tool_use") break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      if (block.name === "read_file") {
        const input = block.input as { path: string };
        let content: string;
        try {
          content = await readFile(input.path);
        } catch {
          content = `Error: file not found at path "${input.path}"`;
        }
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content });
      } else if (block.name === "write_file") {
        const input = block.input as { path: string; content: string };
        changedFilesMap.set(input.path, input.content);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "OK" });
      }
    }

    if (toolResults.length > 0) {
      messages.push({ role: "user", content: toolResults });
    }
  }

  const changedFiles: RepoFile[] = Array.from(changedFilesMap.entries()).map(([path, content]) => ({
    path,
    content,
  }));

  return { changedFiles, summary: prompt.slice(0, 100) };
}

export async function callClaude(
  prompt: string,
  fileContext?: RepoFile[]
): Promise<{ diff: string; summary: string; changedFiles?: RepoFile[] }> {
  const message = await getClient().messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: buildPrompt(prompt, fileContext),
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type from Claude");

  const text = content.text.trim();
  const summary = prompt.slice(0, 100);

  if (fileContext && fileContext.length > 0) {
    const changedFiles = parseFileBlocks(text);
    const diff = changedFiles.map((f) => `Modified: ${f.path}`).join("\n") || text;
    return { diff, summary, changedFiles };
  }

  return { diff: text, summary };
}
