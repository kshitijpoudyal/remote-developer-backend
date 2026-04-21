import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = Array.isArray(req.headers["x-api-key"])
    ? req.headers["x-api-key"][0]
    : req.headers["x-api-key"];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const aliases = process.env.REPO_ALIASES ?? "";
  const repos: { alias: string; repo: string }[] = [];

  for (const pair of aliases.split(",")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const alias = trimmed.slice(0, colonIdx).trim();
    const repo = trimmed.slice(colonIdx + 1).trim();
    if (alias && repo) repos.push({ alias, repo });
  }

  return res.status(200).json(repos);
}
