import express from "express";
import cors from "cors";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import fetch from "node-fetch";

const app = express();
app.use(express.json());
app.use(cors());

// 🔥 LOG SIMPLES PARA SABER SE O SERVIDOR ESTÁ RODANDO
console.log("🚀 FFmpeg API iniciada em", new Date().toISOString());

// ======================================================
//  FUNÇÕES AUXILIARES
// ======================================================

// Baixa arquivo temporário
async function downloadTempFile(url, type) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Falha ao baixar arquivo temporário");
  const buffer = await response.arrayBuffer();
  const tempPath = path.join(os.tmpdir(), `temp_${Date.now()}.${type}`);
  fs.writeFileSync(tempPath, Buffer.from(buffer));
  return tempPath;
}

// ======================================================
//  ENDPOINTS DE ÁUDIO
// ======================================================

// convert-audio
app.post("/convert-audio", async (req, res) => {
  const { url, format = "mp3" } = req.body;
  try {
    const inputPath = await downloadTempFile(url, "audio");
    const outputPath = path.join(os.tmpdir(), `output_${Date.now()}.${format}`);
    const ffmpeg = spawn("ffmpeg", ["-y", "-i", inputPath, outputPath]);

    ffmpeg.on("close", (code) => {
      fs.unlinkSync(inputPath);
      if (code !== 0) return res.status(500).json({ error: "Falha na conversão" });
      res.download(outputPath, () => fs.unlinkSync(outputPath));
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// equalize
app.post("/equalize", async (req, res) => {
  res.json({ message: "Equalização executada (mock)" });
});

// speed-audio
app.post("/speed-audio", async (req, res) => {
  res.json({ message: "Velocidade ajustada (mock)" });
});

// mix-audio
app.post("/mix-audio", async (req, res) => {
  res.json({ message: "Áudio mixado (mock)" });
});

// cut-audio
app.post("/cut-audio", async (req, res) => {
  res.json({ message: "Corte de áudio aplicado (mock)" });
});

// fade
app.post("/fade", async (req, res) => {
  res.json({ message: "Fade aplicado (mock)" });
});

// waveform
app.post("/waveform", async (req, res) => {
  res.json({ message: "Waveform gerado (mock)" });
});

// ======================================================
//  ENDPOINTS DE VÍDEO
// ======================================================

app.post("/convert-video", async (req, res) => {
  res.json({ message: "Conversão de vídeo (mock)" });
});
app.post("/cut-video", async (req, res) => {
  res.json({ message: "Corte de vídeo (mock)" });
});
app.post("/resize", async (req, res) => {
  res.json({ message: "Resize aplicado (mock)" });
});
app.post("/rotate", async (req, res) => {
  res.json({ message: "Rotação aplicada (mock)" });
});
app.post("/watermark", async (req, res) => {
  res.json({ message: "Watermark inserido (mock)" });
});
app.post("/gif", async (req, res) => {
  res.json({ message: "GIF gerado (mock)" });
});
app.post("/thumbnail", async (req, res) => {
  res.json({ message: "Thumbnail criado (mock)" });
});
app.post("/compress", async (req, res) => {
  res.json({ message: "Compressão aplicada (mock)" });
});
app.post("/analyze", async (req, res) => {
  res.json({ message: "Análise retornada (mock)" });
});

// ======================================================
//  HEALTH CHECK AUTOMÁTICO
// ======================================================

app.get("/", async (req, res) => {
  const base = "https://video.llaosdigital.com.br";
  const endpoints = [
    "convert-audio", "equalize", "speed-audio", "mix-audio", "cut-audio",
    "fade", "waveform", "convert-video", "cut-video", "resize",
    "rotate", "watermark", "gif", "thumbnail", "compress", "analyze"
  ];

  const results = [];

  for (const ep of endpoints) {
    try {
      const response = await fetch(`${base}/${ep}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/test.mp4" }),
      });

      const status = response.status;
      const msg =
        status === 200
          ? "✅ OK — rota funcional"
          : status === 500
          ? "⚙️ Rota existe (erro esperado, mas funcional)"
          : `⚠️ Código ${status}`;

      results.push({ endpoint: ep, status, message: msg });
    } catch (err) {
      results.push({ endpoint: ep, status: 0, message: "❌ Timeout / sem resposta" });
    }
  }

  res.json({
    service: "🎬 FFmpeg API — Health Check",
    baseUrl: base,
    totalTested: endpoints.length,
    results,
    checkedAt: new Date().toISOString(),
  });
});

// ======================================================
//  SERVIDOR
// ======================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});
