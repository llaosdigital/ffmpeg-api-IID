import express from "express";
import { spawn } from "child_process";
import fetch from "node-fetch";

const app = express();
app.use(express.json({ limit: "200mb" }));

// --------------------- //
// Função auxiliar comum //
// --------------------- //
async function streamFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao baixar mídia");
  return res.body;
}

function runFfmpeg(args, inputStream, res, contentType, filename) {
  const ffmpeg = spawn("ffmpeg", args);

  inputStream.pipe(ffmpeg.stdin);

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

  ffmpeg.stdout.pipe(res);
  ffmpeg.stderr.on("data", (d) => console.log("FFmpeg:", d.toString()));

  ffmpeg.on("close", (code) => {
    console.log("FFmpeg finalizado com código", code);
  });
}

// --------------------------- //
// Endpoint: GET / (status)   //
// --------------------------- //
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "FFmpeg API online — use POST /convert-audio, /convert-video, /extract-audio ou /merge"
  });
});

// --------------------------- //
// Endpoint: converter áudio   //
// --------------------------- //
app.post("/convert-audio", async (req, res) => {
  try {
    const { url, format = "mp3" } = req.body;
    if (!url) return res.status(400).json({ error: "Parâmetro 'url' obrigatório" });

    const input = await streamFromUrl(url);
    const args = ["-i", "pipe:0", "-vn", "-f", format, "pipe:1"];

    runFfmpeg(args, input, res, "audio/" + format, `output.${format}`);
  } catch (err) {
    console.error("Erro /convert-audio:", err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------------- //
// Endpoint: converter vídeo   //
// --------------------------- //
app.post("/convert-video", async (req, res) => {
  try {
    const { url, format = "mp4" } = req.body;
    if (!url) return res.status(400).json({ error: "Parâmetro 'url' obrigatório" });

    const input = await streamFromUrl(url);
    const args = ["-i", "pipe:0", "-c:v", "libx264", "-preset", "veryfast", "-f", format, "pipe:1"];

    runFfmpeg(args, input, res, "video/" + format, `output.${format}`);
  } catch (err) {
    console.error("Erro /convert-video:", err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------------- //
// Endpoint: extrair áudio     //
// --------------------------- //
app.post("/extract-audio", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Parâmetro 'url' obrigatório" });

    const input = await streamFromUrl(url);
    const args = ["-i", "pipe:0", "-vn", "-acodec", "mp3", "-f", "mp3", "pipe:1"];

    runFfmpeg(args, input, res, "audio/mpeg", "extracted.mp3");
  } catch (err) {
    console.error("Erro /extract-audio:", err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------------- //
// Endpoint: merge de vídeos   //
// --------------------------- //
app.post("/merge", async (req, res) => {
  try {
    const { url1, url2, format = "mp4" } = req.body;
    if (!url1 || !url2)
      return res.status(400).json({ error: "Parâmetros 'url1' e 'url2' obrigatórios" });

    const list = `file '${url1}'\nfile '${url2}'\n`;
    const ffmpeg = spawn("ffmpeg", [
      "-f", "concat",
      "-safe", "0",
      "-i", "-",
      "-c", "copy",
      "-f", format,
      "pipe:1"
    ]);

    res.setHeader("Content-Type", "video/" + format);
    res.setHeader("Content-Disposition", `attachment; filename=merged.${format}`);

    ffmpeg.stdin.write(list);
    ffmpeg.stdin.end();

    ffmpeg.stdout.pipe(res);
    ffmpeg.stderr.on("data", (d) => console.log("FFmpeg:", d.toString()));
    ffmpeg.on("close", (code) => console.log("FFmpeg finalizado com código", code));
  } catch (err) {
    console.error("Erro /merge:", err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------------- //
// Inicialização do servidor   //
// --------------------------- //
const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`✅ API FFmpeg rodando na porta ${port}`);
});
