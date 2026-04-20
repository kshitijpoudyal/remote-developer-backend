import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "error", message: "Method not allowed" });
  }

  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ status: "error", message: "Unauthorized" });
  }

  let body: { prompt?: unknown; repo?: unknown; tool?: unknown };
  try {
    body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(req.body);
  } catch {
    return res.status(400).json({ status: "error", message: "Invalid JSON body" });
  }

  const { prompt, repo, tool } = body;

  if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
    return res.status(400).json({ status: "error", message: "prompt is required and must be a non-empty string" });
  }

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    prompt: prompt.trim(),
    repo: repo ?? null,
    tool: tool ?? null,
  }));

  return res.status(200).json({
    status: "success",
    message: "Prompt received",
    data: {
      prompt: prompt.trim(),
    },
  });
}
