import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function callClaude(prompt: string): Promise<{ diff: string; summary: string }> {
  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Apply the following change: ${prompt}.\nReturn ONLY a valid unified git diff.\nDo not include explanations, markdown, or any extra text.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type from Claude");

  const diff = content.text.trim();
  const summary = prompt.slice(0, 100);

  return { diff, summary };
}
