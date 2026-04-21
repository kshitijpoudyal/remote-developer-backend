import OpenAI from "openai";
import type { RepoFile } from "../github";

function buildPrompt(prompt: string, fileContext?: RepoFile[]): string {
  if (!fileContext || fileContext.length === 0) {
    return `Apply the following change: ${prompt}.`;
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

export async function callCodex(
  prompt: string,
  fileContext?: RepoFile[]
): Promise<{ diff: string; summary: string; changedFiles?: RepoFile[] }> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt =
    fileContext && fileContext.length > 0
      ? "You are a code change assistant. When given file contents, return only the modified files in === FILE: path === / === END FILE === blocks. No explanations, no markdown, no extra text."
      : "You are a code change assistant. Return ONLY a valid unified git diff. No explanations, no markdown, no extra text.";

  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: buildPrompt(prompt, fileContext) },
    ],
    max_tokens: 4096,
    temperature: 0,
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  const summary = prompt.slice(0, 100);

  if (fileContext && fileContext.length > 0) {
    const changedFiles = parseFileBlocks(text);
    const diff = changedFiles.map((f) => `Modified: ${f.path}`).join("\n") || text;
    return { diff, summary, changedFiles };
  }

  return { diff: text, summary };
}
