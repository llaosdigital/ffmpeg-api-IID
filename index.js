import express from "express";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json());
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Utilitário para baixar arquivo remoto em tmp
async function downloadTempFile(url, ext = "tmp") {
  const tempPath = path.join(__dirname, `tmp_${Date.now()}.${ext}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar: ${url}`);
  const fileStream = fs.createWriteStream(tempPath);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on("error", reject);
    fileStream.on("finish", resolve);
  });
  return tempPath;
}

// --- 1️⃣ Converter áudio ---
app.post("/convert-audio", async (req, res) => {
  const { url, format = "mp3", filename = `audio_${Date.now()}` } = req.body;
  try {
    const inputPath = await downloadTempFile(url, "input");
    const outputPath = path.join(__dirname, `${filename}.${format}`);

    const ffmpeg = spawn("ffmpeg", [
      "-y", "-i", inputPath,
      "-vn",
      "-acodec", "libmp3lame",
      "-ar", "44100", "-ac", "2", "-b:a", "192k",
      outputPath
    ]);

    ffmpeg.stderr.on("data", data => console.log(data.toString()));

    ffmpeg.on("close", code => {
      fs.unlinkSync(inputPath);
      if (code !== 0 || !fs.existsSync(outputPath)) {
        return res.status(500).json({ error: `Falha FFmpeg código ${code}` });
      }
      const file = fs.readFileSync(outputPath);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.${format}"`);
      res.send(file);
      fs.unlinkSync(outputPath);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- 2️⃣ Converter vídeo ---
app.post("/convert-video", async (req, res) => {
  const { url, format = "mp4", filename = `video_${Date.now()}` } = req.body;
  try {
    const inputPath = await downloadTempFile(url, "input");
    const outputPath = path.join(__dirname, `${filename}.${format}`);

    const ffmpeg = spawn("ffmpeg", [
      "-y", "-i", inputPath,
      "-c:v", "libx264", "-preset", "fast",
      "-c:a", "aac", "-b:a", "128k",
      outputPath
    ]);

    ffmpeg.stderr.on("data", data => console.log(data.toString()));

    ffmpeg.on("close", code => {
      fs.unlinkSync(inputPath);
      if (code !== 0 || !fs.existsSync(outputPath)) {
        return res.status(500).json({ error: `Falha FFmpeg código ${code}` });
      }
      const file = fs.readFileSync(outputPath);
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.${format}"`);
      res.send(file);
      fs.unlinkSync(outputPath);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- 3️⃣ Merge (vídeo ou áudio) ---
app.post("/merge", async (req, res) => {
  const { urls = [], format = "mp4", filename = `merged_${Date.now()}` } = req.body;
  if (!Array.isArray(urls) || urls.length < 2) {
    return res.status(400).json({ error: "Envie pelo menos 2 URLs para mesclar" });
  }

  try {
    const tempFiles = [];
    for (const u of urls) tempFiles.push(await downloadTempFile(u, "part"));

    const listFile = path.join(__dirname, `list_${Date.now()}.txt`);
    fs.writeFileSync(listFile, tempFiles.map(f => `file '${f}'`).join("\n"));
    const outputPath = path.join(__dirname, `${filename}.${format}`);

    const ffmpeg = spawn("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0",
      "-i", listFile, "-c", "copy",
      outputPath
    ]);

    ffmpeg.stderr.on("data", data => console.log(data.toString()));

    ffmpeg.on("close", code => {
      tempFiles.forEach(f => fs.unlinkSync(f));
      fs.unlinkSync(listFile);
      if (code !== 0 || !fs.existsSync(outputPath)) {
        return res.status(500).json({ error: `Falha FFmpeg código ${code}` });
      }
      const file = fs.readFileSync(outputPath);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.${format}"`);
      res.send(file);
      fs.unlinkSync(outputPath);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- 4️⃣ Status ---
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "FFmpeg API online — use POST /convert-audio, /convert-video ou /merge"
  });
});

// --- Servidor ---
const port = process.env.PORT || 8080;
app.listen(port, "0.0.0.0", () => console.log(`✅ API FFmpeg rodando na porta ${port}`));
