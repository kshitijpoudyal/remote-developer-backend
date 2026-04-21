import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI, { toFile } from "openai";

export const config = { maxDuration: 30, api: { bodyParser: false } };

function getApiKey(req: VercelRequest): string | undefined {
  const key = req.headers["x-api-key"];
  return Array.isArray(key) ? key[0] : key;
}

function readBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = getApiKey(req);
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY not configured" });
  }

  const contentType = (req.headers["content-type"] || "audio/webm").split(";")[0];
  const buffer = await readBody(req);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const file = await toFile(buffer, "audio.webm", { type: contentType });

  const result = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file,
    language: "en",
  });

  return res.status(200).json({ text: result.text });
}
