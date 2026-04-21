import "dotenv/config";
import http from "http";
import handler from "./api/execute";

const PORT = 3000;

const server = http.createServer((req, res) => {
  const chunks: Uint8Array[] = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const rawBody = Buffer.concat(chunks).toString();

    // Patch res to match VercelResponse shape
    const vercelRes = Object.assign(res, {
      status(code: number) {
        res.statusCode = code;
        return vercelRes;
      },
      json(data: unknown) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(data));
        return vercelRes;
      },
    });

    // Patch req to match VercelRequest shape
    const vercelReq = Object.assign(req, {
      body: rawBody ? (() => { try { return JSON.parse(rawBody); } catch { return rawBody; } })() : {},
    });

    handler(vercelReq as never, vercelRes as never).catch((err: unknown) => {
      console.error(err);
      res.statusCode = 500;
      res.end(JSON.stringify({ status: "error", message: "Internal server error" }));
    });
  });
});

server.listen(PORT, () => {
  console.log(`Ready! Available at http://localhost:${PORT}`);
});
