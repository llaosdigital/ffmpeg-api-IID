import express from "express";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import os from "os";

const app = express();
app.use(express.json());

// Função auxiliar para baixar arquivos temporários
async function downloadTempFile(url, prefix = "temp") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar: ${url}`);
  const buffer = await res.arrayBuffer();
  const tmpPath = path.join(os.tmpdir(), `${prefix}_${Date.now()}`);
  fs.writeFileSync(tmpPath, Buffer.from(buffer));
  return tmpPath;
}

// Endpoint raiz
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message:
      "FFmpeg API online — use POST /convert-audio, /convert-video, /extract-audio, /merge e outros endpoints avançados.",
  });
});

//////////////////////
// AUDIO ENDPOINTS
//////////////////////

// /convert-audio
app.post("/convert-audio", async (req, res) => {
  const { url, format = "mp3", filename = `output_${Date.now()}` } = req.body;
  try {
    const inputPath = await downloadTempFile(url, "audio");
    const outputPath = path.join(os.tmpdir(), `${filename}.${format}`);
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

// /equalize
app.post("/equalize", async (req, res) => {
  const { url, filename = `equalized_${Date.now()}` } = req.body;
  try {
    const inputPath = await downloadTempFile(url, "input");
    const outputPath = path.join(os.tmpdir(), `${filename}.mp3`);
    const ffmpeg = spawn("ffmpeg", [
      "-y", "-i", inputPath,
      "-af", "loudnorm,equalizer=f=1000:width_type=h:width=200:g=5",
      outputPath,
    ]);
    ffmpeg.on("close", (code) => {
      fs.unlinkSync(inputPath);
      if (code !== 0) return res.status(500).json({ error: "Erro ao equalizar áudio" });
      res.download(outputPath, () => fs.unlinkSync(outputPath));
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// /speed-audio
app.post("/speed-audio", async (req, res) => {
  const { url, speed = 1.0, filename = `speed_${Date.now()}` } = req.body;
  try {
    const inputPath = await downloadTempFile(url, "input");
    const outputPath = path.join(os.tmpdir(), `${filename}.mp3`);
    const ffmpeg = spawn("ffmpeg", ["-y", "-i", inputPath, "-filter:a", `atempo=${speed}`, outputPath]);
    ffmpeg.on("close", (code) => {
      fs.unlinkSync(inputPath);
      if (code !== 0) return res.status(500).json({ error: "Erro ao alterar velocidade" });
      res.download(outputPath, () => fs.unlinkSync(outputPath));
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// /mix-audio
app.post("/mix-audio", async (req, res) => {
  const { urls = [], filename = `mix_${Date.now()}` } = req.body;
  if (urls.length < 2) return res.status(400).json({ error: "Envie pelo menos 2 URLs." });
  try {
    const temp = [];
    for (const u of urls) temp.push(await downloadTempFile(u, "part"));
    const outputPath = path.join(os.tmpdir(), `${filename}.mp3`);
    const ffmpeg = spawn("ffmpeg", ["-y", "-i", temp[0], "-i", temp[1], "-filter_complex", "amix=inputs=2:duration=longest", outputPath]);
    ffmpeg.on("close", (code) => {
      temp.forEach((f) => fs.unlinkSync(f));
      if (code !== 0) return res.status(500).json({ error: "Erro ao mixar áudio" });
      res.download(outputPath, () => fs.unlinkSync(outputPath));
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// /cut-audio
app.post("/cut-audio", async (req, res) => {
  const { url, start, end, filename = `cut_${Date.now()}` } = req.body;
  try {
    const inputPath = await downloadTempFile(url, "input");
    const outputPath = path.join(os.tmpdir(), `${filename}.mp3`);
    const ffmpeg = spawn("ffmpeg", ["-y", "-i", inputPath, "-ss", start, "-to", end, "-c", "copy", outputPath]);
    ffmpeg.on("close", (code) => {
      fs.unlinkSync(inputPath);
      if (code !== 0) return res.status(500).json({ error: "Erro ao cortar áudio" });
      res.download(outputPath, () => fs.unlinkSync(outputPath));
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// /fade
app.post("/fade", async (req, res) => {
  const { url, type = "in", duration = 5, filename = `fade_${Date.now()}` } = req.body;
  const fadeFilter = type === "out" ? `afade=t=out:st=0:d=${duration}` : `afade=t=in:st=0:d=${duration}`;
  try {
    const inputPath = await downloadTempFile(url, "input");
    const outputPath = path.join(os.tmpdir(), `${filename}.mp3`);
    const ffmpeg = spawn("ffmpeg", ["-y", "-i", inputPath, "-af", fadeFilter, outputPath]);
    ffmpeg.on("close", (code) => {
      fs.unlinkSync(inputPath);
      if (code !== 0) return res.status(500).json({ error: "Erro ao aplicar fade" });
      res.download(outputPath, () => fs.unlinkSync(outputPath));
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// /waveform
app.post("/waveform", async (req, res) => {
  const { url, filename = `waveform_${Date.now()}` } = req.body;
  try {
    const inputPath = await downloadTempFile(url, "input");
    const outputPath = path.join(os.tmpdir(), `${filename}.png`);
    const ffmpeg = spawn("ffmpeg", ["-y", "-i", inputPath, "-lavfi", "showwavespic=s=1280x200", "-frames:v", "1", outputPath]);
    ffmpeg.on("close", (code) => {
      fs.unlinkSync(inputPath);
      if (code !== 0) return res.status(500).json({ error: "Erro ao gerar waveform" });
      res.download(outputPath, () => fs.unlinkSync(outputPath));
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

//////////////////////
// VIDEO ENDPOINTS
//////////////////////

// /convert-video
app.post("/convert-video", async (req, res) => {
  const { url, format = "mp4", filename = `video_${Date.now()}` } = req.body;
  try {
    const inputPath = await downloadTempFile(url, "video");
    const outputPath = path.join(os.tmpdir(), `${filename}.${format}`);
    const ffmpeg = spawn("ffmpeg", ["-y", "-i", inputPath, outputPath]);
    ffmpeg.on("close", (code) => {
      fs.unlinkSync(inputPath);
      if (code !== 0) return res.status(500).json({ error: "Falha na conversão de vídeo" });
      res.download(outputPath, () => fs.unlinkSync(outputPath));
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// /cut-video
app.post("/cut-video", async (req, res) => {
  const { url, start, end, filename = `cut_${Date.now()}` } = req.body;
  try {
    const inputPath = await downloadTempFile(url, "video");
    const outputPath = path.join(os.tmpdir(), `${filename}.mp4`);
    const ffmpeg = spawn("ffmpeg", ["-y", "-i", inputPath, "-ss", start, "-to", end, "-c", "copy", outputPath]);
    ffmpeg.on("close", (code) => {
      fs.unlinkSync(inputPath);
      if (code !== 0) return res.status(500).json({ error: "Erro ao cortar vídeo" });
      res.download(outputPath, () => fs.unlinkSync(outputPath));
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// /resize
app.post("/resize", async (req, res) => {
  const { url, width = 720, height = 1280, filename = `resize_${Date.now()}` } = req.body;
  try {
    const inputPath = await downloadTempFile(url, "video");
    const outputPath = path.join(os.tmpdir(), `${filename}.mp4`);
    const ffmpeg = spawn("ffmpeg", ["-y", "-i", inputPath, "-vf", `scale=${width}:${height}`, outputPath]);
    ffmpeg.on("close", (code) => {
      fs.unlinkSync(inputPath);
      if (code !== 0) return res.status(500).json({ error: "Erro ao redimensionar vídeo" });
      res.download(outputPath, () => fs.unlinkSync(outputPath));
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// /rotate
app.post("/rotate", async (req, res) => {
  const { url, direction = "right", filename = `rotate_${Date.now()}` } = req.body;
  const transpose = direction === "left" ? "2" : "1";
  try {
    const inputPath = await downloadTempFile(url, "video");
    const outputPath = path.join(os.tmpdir(), `${filename}.mp4`);
    const ffmpeg = spawn("ffmpeg", ["-y", "-i", inputPath, "-vf", `transpose=${transpose}`, outputPath]);
    ffmpeg.on("close", (code) => {
      fs.unlinkSync(inputPath);
      if (code !== 0) return res.status(500).json({ error: "Erro ao rotacionar vídeo" });
      res.download(outputPath, () => fs.unlinkSync(outputPath));
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// /watermark
app.post("/watermark", async (req, res) => {
  const { url, watermark, x = 10, y = 10, filename = `watermarked_${Date.now()}` } = req.body;
  if (!watermark) return res.status(400).json({ error: "Informe a URL da imagem de watermark." });
  try {
    const videoPath = await downloadTempFile(url, "video");
    const wmPath = await downloadTempFile(watermark, "wm");
    const outputPath = path.join(os.tmpdir(), `${filename}.mp4`);
    const ffmpeg = spawn("ffmpeg", ["-y", "-i", videoPath, "-i", wmPath, "-filter_complex", `overlay=${x}:${y}`, outputPath]);
    ffmpeg.on("close", (code) => {
      fs.unlinkSync(videoPath);
      fs.unlinkSync(wmPath);
      if (code !== 0) return res.status(500).json({ error: "Erro ao aplicar watermark" });
      res.download(outputPath, () => fs.unlinkSync(outputPath));
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// /gif
app.post("/gif", async (req, res) => {
  const { url, filename = `gif_${Date.now()}` } = req.body;
  try {
    const inputPath = await downloadTempFile(url, "video");
    const outputPath = path.join(os.tmpdir(), `${filename}.gif`);
    const ffmpeg = spawn("ffmpeg", [
      "-y", "-i", inputPath,
      "-vf", "fps=10,scale=480:-1:flags=lanczos,palettegen",
      outputPath
    ]);
    ffmpeg.on("close", (code) => {
      fs.unlinkSync(inputPath);
      if (code !== 0) return res.status(500).json({ error: "Erro ao gerar GIF" });
      res.download(outputPath, () => fs.unlinkSync(outputPath));
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// /thumbnail
app.post("/thumbnail", async (req, res) => {
  const { url, time = "00:00:02", filename = `thumb_${Date.now()}` } = req.body;
  try {
    const inputPath = await downloadTempFile(url, "video");
    const outputPath = path.join(os.tmpdir(), `${filename}.jpg`);
    const ffmpeg = spawn("ffmpeg", ["-y", "-ss", time, "-i", inputPath, "-frames:v", "1", outputPath]);
    ffmpeg.on("close", (code) => {
      fs.unlinkSync(inputPath);
      if (code !== 0) return res.status(500).json({ error: "Erro ao gerar thumbnail" });
      res.download(outputPath, () => fs.unlinkSync(outputPath));
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

//////////////////////
// MÍDIA AVANÇADA
//////////////////////

// /compress
app.post("/compress", async (req, res) => {
  const { url, crf = 28, preset = "medium", filename = `compressed_${Date.now()}` } = req.body;
  try {
    const inputPath = await downloadTempFile(url, "video");
    const outputPath = path.join(os.tmpdir(), `${filename}.mp4`);
    const ffmpeg = spawn("ffmpeg", ["-y", "-i", inputPath, "-vcodec", "libx264", "-crf", `${crf}`, "-preset", preset, outputPath]);
    ffmpeg.on("close", (code) => {
      fs.unlinkSync(inputPath);
      if (code !== 0) return res.status(500).json({ error: "Erro ao comprimir vídeo" });
      res.download(outputPath, () => fs.unlinkSync(outputPath));
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// /analyze — usa ffprobe
app.post("/analyze", async (req, res) => {
  const { url } = req.body;
  try {
    const inputPath = await downloadTempFile(url, "analyze");
    const ffprobe = spawn("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", inputPath]);
    let data = "";
    ffprobe.stdout.on("data", (chunk) => (data += chunk));
    ffprobe.on("close", (code) => {
      fs.unlinkSync(inputPath);
      if (code !== 0) return res.status(500).json({ error: "Erro ao analisar mídia" });
      res.json(JSON.parse(data));
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

//////////////////////
// SERVIDOR
//////////////////////

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 FFmpeg API ativa na porta ${PORT}`));
