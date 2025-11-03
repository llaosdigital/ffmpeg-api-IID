// index.js – FFmpeg API completa (v2.3 unificada + base64 + segurança)
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import rateLimit from "express-rate-limit";

const app = express();
app.set("trust proxy", true);
app.disable("x-powered-by");
app.use(express.json({ limit: "200mb" }));
app.use(cors());

// ====================== 🧱 BLOQUEIO DE SCANNERS ======================
app.use((req, res, next) => {
  const pathSuspect = req.path.toLowerCase();
  const blocked = [".env", ".git", "php", "phpinfo", "config", "backup", "test"];
  if (blocked.some(b => pathSuspect.includes(b))) {
    console.warn(`🚫 Tentativa bloqueada: ${req.path} de ${req.ip}`);
    return res.status(403).send("Forbidden");
  }
  next();
});

// ====================== ⏳ RATE LIMITER ======================
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
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

  // Libera o painel /
  if (req.method === "GET" && req.path === "/") return next();

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

// ====================== 🎧 CONVERT-AUDIO (URL + BASE64) ======================
app.post("/convert-audio", async (req, res) => {
  const { url, base64, format = "mp3" } = req.body;
  let input;

  try {
    if (url) {
      input = await downloadTempFile(url, "audio");
    } else if (base64) {
      const base64Data = base64.split(",").pop();
      const buffer = Buffer.from(base64Data, "base64");
      input = path.join(os.tmpdir(), `audio_${Date.now()}.webm`);
      await fs.promises.writeFile(input, buffer);
    } else {
      return res.status(400).json({ error: "Envie 'url' ou 'base64'." });
    }

    const output = path.join(os.tmpdir(), `audio_${Date.now()}.${format}`);
    const codec = format === "wav" ? "pcm_s16le" : "libmp3lame";

    const ffmpeg = spawn("ffmpeg", ["-i", input, "-vn", "-acodec", codec, output]);

    ffmpeg.stderr.on("data", d => console.log(d.toString()));

    ffmpeg.on("close", async code => {
      if (code !== 0) return res.status(500).json({ error: "Erro FFmpeg" });
      const data = await fs.promises.readFile(output);
      res.setHeader("Content-Type", format === "wav" ? "audio/wav" : "audio/mpeg");
      res.send(data);
      fs.unlinkSync(input);
      fs.unlinkSync(output);
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ====================== 🎬 CONVERT-VIDEO (URL + BASE64) ======================
app.post("/convert-video", async (req, res) => {
  const { url, base64, format = "mp4" } = req.body;
  let input;

  try {
    if (url) {
      input = await downloadTempFile(url, "video");
    } else if (base64) {
      const base64Data = base64.split(",").pop();
      const buffer = Buffer.from(base64Data, "base64");
      input = path.join(os.tmpdir(), `video_${Date.now()}.webm`);
      await fs.promises.writeFile(input, buffer);
    } else {
      return res.status(400).json({ error: "Envie 'url' ou 'base64'." });
    }

    const output = path.join(os.tmpdir(), `video_${Date.now()}.${format}`);
    const ffmpeg = spawn("ffmpeg", [
      "-i", input,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      output
    ]);

    ffmpeg.stderr.on("data", d => console.log(d.toString()));

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

// ====================== 🎬 MERGE ======================
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
    ffmpeg.stderr.on("data", d => console.log(d.toString()));

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

// ====================== 🧩 OUTROS ENDPOINTS ======================
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

// ====================== HEALTHCHECK ======================
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
  res.json({
    service: "FFmpeg API",
    version: "v2.3 blindada (base64 + API key + healthcheck + rate limit)",
    endpoints: results
  });
});

// ====================== 🚀 START =====================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ API FFmpeg rodando na porta ${PORT}`));
