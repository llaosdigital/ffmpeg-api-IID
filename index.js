// index.js – FFmpeg API completa (v1 + v2 unificada)
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

// Função auxiliar
async function downloadTempFile(url, prefix = "temp") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar: ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const filePath = path.join(os.tmpdir(), `${prefix}_${Date.now()}.mp4`);
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

// --------------- 1️⃣ CONVERSÕES BÁSICAS ---------------
app.post("/convert-audio", async (req, res) => {
  const { url, format = "mp3" } = req.body;
  try {
    const input = await downloadTempFile(url, "audio");
    const output = path.join(os.tmpdir(), `audio_${Date.now()}.${format}`);
    const ffmpeg = spawn("ffmpeg", ["-i", input, "-vn", "-acodec", "libmp3lame", output]);

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

// --------------- 2️⃣ MERGE (ÁUDIO OU VÍDEO) ---------------
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

// --------------- 3️⃣ OUTROS ENDPOINTS (v2) ---------------
app.post("/equalize", (req, res) => res.json({ status: "equalizer placeholder OK" }));
app.post("/speed-audio", (req, res) => res.json({ status: "speed change placeholder OK" }));
app.post("/mix-audio", (req, res) => res.json({ status: "mix audio placeholder OK" }));
app.post("/cut-audio", (req, res) => res.json({ status: "cut audio placeholder OK" }));
app.post("/fade", (req, res) => res.json({ status: "fade audio placeholder OK" }));
app.post("/waveform", (req, res) => res.json({ status: "waveform placeholder OK" }));
app.post("/cut-video", (req, res) => res.json({ status: "cut video placeholder OK" }));
app.post("/resize", (req, res) => res.json({ status: "resize placeholder OK" }));
app.post("/rotate", (req, res) => res.json({ status: "rotate placeholder OK" }));
app.post("/watermark", (req, res) => res.json({ status: "watermark placeholder OK" }));
app.post("/gif", (req, res) => res.json({ status: "gif placeholder OK" }));
app.post("/thumbnail", (req, res) => res.json({ status: "thumbnail placeholder OK" }));
app.post("/compress", (req, res) => res.json({ status: "compress placeholder OK" }));
app.post("/analyze", (req, res) => res.json({ status: "analyze placeholder OK" }));

// --------------- 4️⃣ HEALTHCHECK / STATUS ---------------
app.get("/", async (req, res) => {
  const endpoints = [
    "convert-audio", "convert-video", "merge",
    "equalize", "speed-audio", "mix-audio", "cut-audio", "fade", "waveform",
    "cut-video", "resize", "rotate", "watermark", "gif", "thumbnail", "compress", "analyze"
  ];

  const results = [];
  for (const ep of endpoints) {
    try {
      const r = await fetch(`http://localhost:${PORT}/${ep}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/test.mp4" })
      });
      results.push({ endpoint: ep, status: r.status });
    } catch {
      results.push({ endpoint: ep, status: "offline" });
    }
  }

  res.json({
    service: "FFmpeg API",
    version: "v2.0 unified",
    endpoints: results
  });
});

// --------------- 5️⃣ START ---------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ API FFmpeg rodando na porta ${PORT}`));
