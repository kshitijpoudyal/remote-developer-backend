import type { VercelRequest, VercelResponse } from "@vercel/node";
import { routeToModel, type AITool } from "../lib/router";

/**
 * Main API handler for the `/api/execute` endpoint.
 *
 * Accepts a POST request containing a natural-language prompt and an optional
 * AI tool selector, authenticates the caller via the `x-api-key` header, and
 * routes the prompt to the chosen AI provider (Claude, Codex, or Copilot).
 *
 * @param req - The incoming Vercel request object.
 * @param res - The Vercel response object used to send back results.
 *
 * @returns A JSON response with the following shape:
 *   - On success (200): `{ status: "success", diff: string, summary: string }`
 *   - On provider failure (502): `{ status: "error", message: string }`
 *   - On client error (400/401/405): `{ status: "error", message: string }`
 *
 * @example
 * // Request
 * POST /api/execute
 * Headers: { "x-api-key": "<valid key>" }
 * Body:    { "prompt": "Add a health-check endpoint", "tool": "claude" }
 *
 * // Successful response (200)
 * { "status": "success", "diff": "...", "summary": "..." }
 */
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
