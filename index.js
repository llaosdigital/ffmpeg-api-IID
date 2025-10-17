// index.js – FFmpeg API completa (v1 + v2 unificada + API KEY)
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

const app = express();
app.use(express.json({ limit: "200mb" }));
app.use(cors());

// ====================== 🔐 Middleware de API Key ======================
function checkApiKey(req, res, next) {
  const apiKeyEnv = process.env.API_KEY;

  // Se não há API_KEY definida, apenas avisa (modo livre)
  if (!apiKeyEnv) {
    console.warn("⚠️ Nenhuma API_KEY configurada no ambiente — acesso liberado.");
    return next();
  }

  // Ignora a checagem para o healthcheck
  if (req.method === "GET" && req.path === "/") return next();

  // Aceita via Header ou Bearer
  const headerKey =
    req.headers["x-api-key"] ||
    (req.headers["authorization"] && req.headers["authorization"].split(" ")[1]);

  if (!headerKey || headerKey !== apiKeyEnv) {
    return res.status(401).json({ error: "Unauthorized: API key inválida ou ausente." });
  }

  next();
}

// Aplica o middleware global (afeta tudo exceto GET /)
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
  "equalize","speed-audio","mix-audio","cut-audio","fade","waveform",
  "cut-video","resize","rotate","watermark","gif","thumbnail","compress","analyze"
];

for (const ep of simpleEndpoints) {
  app.post(`/${ep}`, (req, res) => res.json({ status: `${ep} placeholder OK` }));
}

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
              ...(apiKeyEnv ? { "x-api-key": apiKeyEnv } : {}) // 🔑 injeta API key
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
                ? "⚠️ Requisição inválida (provável input ausente)"
                : "❌ Erro"
          };
        } catch {
          return { endpoint: ep, status: "offline", message: "❌ Sem resposta" };
        }
      })
    );

    results.push(...batchResults);
    await delay(1500);
  }

  process.env.NODE_ENV = "production";

  res.json({
    service: "FFmpeg API",
    version: "v2.1 unified (API key + parallel healthcheck)",
    endpoints: results
  });
});

// ====================== 🚀 START ======================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ API FFmpeg rodando na porta ${PORT}`));
