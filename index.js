// index.js – FFmpeg API completa (v2.2 blindada + API KEY)
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import rateLimit from "express-rate-limit";

const app = express();
app.disable("x-powered-by"); // remove header de identificação
app.use(express.json({ limit: "200mb" }));
app.use(cors());

// ====================== 🧱 BLOQUEIO DE SCANNERS E ROTAS SUSPEITAS ======================
app.use((req, res, next) => {
  const pathSuspect = req.path.toLowerCase();
  const blocked = [
    ".env",
    ".git",
    "php",
    "phpinfo",
    "config",
    "backup",
    "test"
  ];
  if (blocked.some(b => pathSuspect.includes(b))) {
    console.warn(`🚫 Tentativa bloqueada: ${req.path} de ${req.ip}`);
    return res.status(403).send("Forbidden");
  }
  next();
});

// ====================== ⏳ RATE LIMITER ======================
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 50, // máximo de 50 requisições por IP/min
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`⚠️ IP ${req.ip} excedeu limite de requisições.`);
    res.status(429).json({ error: "Too many requests, try again later." });
  },
});
app.use(limiter);

// ====================== 🔐 Middleware de API Key ======================
function checkApiKey(req, res, next) {
  const apiKeyEnv = process.env.API_KEY;

  if (!apiKeyEnv) {
    console.error("❌ Nenhuma API_KEY configurada no ambiente — abortando inicialização.");
    process.exit(1);
  }

// Libera acesso público ao painel de status /
if (req.method === "GET" && req.path === "/") {
  return next();
}

  const headerKey =
    req.headers["x-api-key"] ||
    (req.headers["authorization"] && req.headers["authorization"].split(" ")[1]);

  if (!headerKey || headerKey !== apiKeyEnv) {
    return res.status(401).json({ error: "Unauthorized: API key inválida ou ausente." });
  }

  next();
}
app.use(checkApiKey);

// ====================== ⚙️ Função auxiliar ======================
async function downloadTempFile(url, prefix = "temp") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar: ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const filePath = path.join(os.tmpdir(), `${prefix}_${Date.now()}.mp4`);
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

// ====================== 🎧 CONVERSÕES BÁSICAS ======================
app.post("/convert-audio", async (req, res) => {
  const { url, format = "mp3" } = req.body;
  try {
    const input = await downloadTempFile(url, "audio");
    const output = path.join(os.tmpdir(), `audio_${Date.now()}.${format}`);
    const ffmpeg = spawn("ffmpeg", ["-i", input, "-vn", "-acodec", "libmp3lame", output]);

    ffmpeg.stderr.on("data", d => {
      if (process.env.NODE_ENV === "health") return;
      console.log(d.toString());
    });

    ffmpeg.on("close", async code => {
      if (code !== 0) return res.status(500).json({ error: "Erro FFmpeg" });
      const data = await fs.promises.readFile(output);
      res.setHeader("Content-Type", "audio/mpeg");
      res.send(data);
      fs.unlinkSync(input);
      fs.unlinkSync(output);
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/convert-video", async (req, res) => {
  const { url, format = "mp4" } = req.body;
  try {
    const input = await downloadTempFile(url, "video");
    const output = path.join(os.tmpdir(), `video_${Date.now()}.${format}`);
    const ffmpeg = spawn("ffmpeg", ["-i", input, "-c:v", "libx264", "-preset", "ultrafast", output]);

    ffmpeg.stderr.on("data", d => {
      if (process.env.NODE_ENV === "health") return;
      console.log(d.toString());
    });

    ffmpeg.on("close", async code => {
      if (code !== 0) return res.status(500).json({ error: "Erro FFmpeg" });
      const data = await fs.promises.readFile(output);
      res.setHeader("Content-Type", "video/mp4");
      res.send(data);
      fs.unlinkSync(input);
      fs.unlinkSync(output);
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ====================== 🎬 MERGE (ÁUDIO OU VÍDEO) ======================
app.post("/merge", async (req, res) => {
  const { urls = [], format = "mp4", filename = `merged_${Date.now()}` } = req.body;
  if (!Array.isArray(urls) || urls.length < 2) {
    return res.status(400).json({ error: "Envie pelo menos 2 URLs para mesclar." });
  }

  try {
    const tempFiles = [];
    for (const u of urls) tempFiles.push(await downloadTempFile(u, "part"));

    const listFile = path.join(os.tmpdir(), `list_${Date.now()}.txt`);
    fs.writeFileSync(listFile, tempFiles.map(f => `file '${f}'`).join("\n"));
    const outputPath = path.join(os.tmpdir(), `${filename}.${format}`);

    const ffmpeg = spawn("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", outputPath]);
    ffmpeg.stderr.on("data", d => {
      if (process.env.NODE_ENV === "health") return;
      console.log(d.toString());
    });

    ffmpeg.on("close", code => {
      tempFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
      fs.existsSync(listFile) && fs.unlinkSync(listFile);

      if (code !== 0 || !fs.existsSync(outputPath)) {
        return res.status(500).json({ error: `Falha FFmpeg código ${code}` });
      }
      const merged = fs.readFileSync(outputPath);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.${format}"`);
      res.setHeader("Content-Type", format === "mp3" ? "audio/mpeg" : "video/mp4");
      res.send(merged);
      fs.unlinkSync(outputPath);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====================== 🧩 OUTROS ENDPOINTS (v2 placeholders) ======================
const simpleEndpoints = [
  "equalize", "speed-audio", "mix-audio", "cut-audio", "fade", "waveform",
  "cut-video", "resize", "rotate", "watermark", "gif", "thumbnail", "compress", "analyze"
];

for (const ep of simpleEndpoints) {
  app.post(`/${ep}`, (req, res) => res.json({ status: `${ep} placeholder OK` }));
}

// ====================== 🌐 ROBOTS.TXT ======================
app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send("User-agent: *\nDisallow: /");
});

// --------------- 4️⃣ HEALTHCHECK / STATUS ---------------
app.get("/", async (req, res) => {
  process.env.NODE_ENV = "health";

  const endpoints = [
    "convert-audio", "convert-video", "merge",
    "equalize", "speed-audio", "mix-audio", "cut-audio", "fade", "waveform",
    "cut-video", "resize", "rotate", "watermark", "gif", "thumbnail", "compress", "analyze"
  ];

  const testVideo1 = "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4";
  const testVideo2 = "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4";
  const results = [];
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const apiKeyEnv = process.env.API_KEY || null;
  const chunkSize = 4;
  const PORT = process.env.PORT || 8080;

  for (let i = 0; i < endpoints.length; i += chunkSize) {
    const batch = endpoints.slice(i, i + chunkSize);
    const batchResults = await Promise.all(
      batch.map(async (ep) => {
        try {
          const body = ep === "merge"
            ? { urls: [testVideo1, testVideo2], format: "mp4", filename: "merge_test" }
            : { url: testVideo1 };

          const r = await fetch(`http://localhost:${PORT}/${ep}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(apiKeyEnv ? { "x-api-key": apiKeyEnv } : {})
            },
            body: JSON.stringify(body)
          });

          return {
            endpoint: ep,
            status: r.status,
            message:
              r.status === 200
                ? "✅ OK"
                : r.status === 400
                ? "⚠️ Input ausente"
                : "❌ Erro"
          };
        } catch {
          return { endpoint: ep, status: "offline", message: "❌ Sem resposta" };
        }
      })
    );

    results.push(...batchResults);
    await delay(1200);
  }

  process.env.NODE_ENV = "production";

  if (req.headers.accept?.includes("text/html")) {
    const rows = results.map(r => `
      <tr>
        <td style="padding:8px;border:1px solid #ccc;">/${r.endpoint}</td>
        <td style="padding:8px;border:1px solid #ccc;text-align:center;">${r.message}</td>
      </tr>
    `).join("");

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>🎬 FFmpeg API-IID v2.2 - Healthcheck</title>
          <style>
            body { font-family: Arial, sans-serif; background:#fafafa; margin:40px; color:#333; }
            h1 { color:#222; }
            table { border-collapse:collapse; width:100%; max-width:600px; background:#fff; }
            th { background:#f0f0f0; padding:10px; border:1px solid #ccc; }
            td { border:1px solid #ccc; }
            button {
              margin-top: 20px;
              padding: 8px 16px;
              border: none;
              background: #0078d7;
              color: white;
              font-size: 15px;
              border-radius: 6px;
              cursor: pointer;
            }
            button:hover { background: #005fa3; }
            footer {
              margin-top: 20px;
              font-size: 14px;
              color: #a5c936;
            }
          </style>
        </head>
        <body>
          <h1>🎬 FFmpeg API-IID v2.2 - Healthcheck</h1>
          <table>
            <tr><th>Endpoint</th><th>Status</th></tr>
            ${rows}
          </table>
          <button onclick="location.reload()">🔄 Atualizar</button>
          <footer>
            Serviço ativo em ${new Date().toLocaleString('pt-BR')}
          </footer>
        </body>
      </html>
    `;
    return res.send(html);
  }

  res.json({
    service: "FFmpeg API",
    version: "v2.2 blindada (API key + parallel healthcheck + rate limit)",
    endpoints: results
  });
});

// ====================== 🚀 START ======================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ API FFmpeg rodando na porta ${PORT}`));
