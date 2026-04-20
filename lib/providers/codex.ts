import OpenAI from "openai";

export async function callCodex(prompt: string): Promise<{ diff: string; summary: string }> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a code change assistant. Return ONLY a valid unified git diff. No explanations, no markdown, no extra text.",
      },
      {
        role: "user",
        content: `Apply the following change: ${prompt}.`,
      },
    ],
    max_tokens: 4096,
    temperature: 0,
  });

  const diff = completion.choices[0]?.message?.content?.trim() ?? "";
  const summary = prompt.slice(0, 100);

  return { diff, summary };
}
