/**
 * POST /api/execute
 *
 * Serverless endpoint that accepts a natural-language prompt and an optional
 * AI tool preference ("claude", "codex", or "copilot"), authenticates the
 * request via an x-api-key header, and routes the prompt to the appropriate
 * AI model through the router. Returns the model's response as JSON.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { routeToModel, type AITool } from "../lib/router";

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

  let body: { prompt?: unknown; tool?: unknown };
  try {
    body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(req.body);
  } catch {
    return res.status(400).json({ status: "error", message: "Invalid JSON body" });
  }

  const { prompt, tool } = body;

  if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
    return res.status(400).json({ status: "error", message: "prompt is required and must be a non-empty string" });
  }

  const validTools: AITool[] = ["claude", "codex", "copilot"];
  const selectedTool = typeof tool === "string" && validTools.includes(tool as AITool)
    ? (tool as AITool)
    : undefined;

  const result = await routeToModel(selectedTool, prompt.trim());

  const statusCode = result.status === "success" ? 200 : 502;
  return res.status(statusCode).json(result);
}