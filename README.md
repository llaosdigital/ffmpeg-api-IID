# Endpoint adicionados - IID V2:

# AUDIO

/equalize > Equalização e normalização de volume - Permite realçar voz, corrigir graves/agudos e nivelar volumes automaticamente.
/speed-audio > Alterar velocidade e tom	atempo, asetrate - Velocidade entre 0.5x–2x e alteração de pitch (voz mais grave/aguda).
/mix-audio > Misturar faixas (voz + música)	amix, volume, afade - Cria narrações, podcasts ou anúncios combinando voz e trilha.
/cut-audio > Cortar trechos	-ss, -to - Permite cortar por tempo inicial/final, útil para snippets e cortes automatizados.
/fade	Aplicar fade in/out > afade=t=in/out - Efeito de entrada e saída suave em trilhas de áudio.
/waveform > Gerar imagem visual do áudio	showspectrumpic, showwavespic - Gera uma imagem (.png) da forma de onda para visualização.

# VIDEO

/cut-video > Cortar trechos por tempo -ss, -to - Base do “Reel Cutter”. Ideal para clipes automáticos.
/resize > Redimensionar ou mudar proporção scale, crop, pad - Transforma vídeos em 9:16, 1:1, 16:9.
/rotate > Girar ou espelhar vídeos transpose, hflip, vflip - Corrige orientação ou cria efeitos.
/text-overlay > Adicionar texto dinâmico drawtext - Permite criar títulos, legendas e marcações visuais.
/watermark > Inserir logo ou imagem	overlay - Marca d’água fixa ou dinâmica sobre o vídeo.
/thumbnail > Extrair frame central	-ss, -frames:v 1 - Gera imagem do meio do vídeo (útil para thumbnails).
/gif > Converter vídeo curto em GIF	palettegen, paletteuse - Otimiza cores e reduz tamanho, ideal para redes sociais.

# MIDIA

/autocaption > Gerar legendas automáticas	Whisper API + FFmpeg - Converte fala → texto e sincroniza legenda SRT.
/merge-transitions > Merge com fade entre vídeos	xfade, afade - Faz transição suave entre vídeos (tipo Reels).
/compress > Reduzir tamanho mantendo qualidade	-crf, -preset - Útil para WhatsApp e posts web.
/combine > Combinar imagem + áudio → vídeo	-loop, -shortest, -c:v libx264 - Gera vídeos com imagem fixa e áudio (padrão para podcasts).
/analyze > Extrair metadados	ffprobe -v quiet -show_format -show_streams -of json - Retorna JSON com info: duração, codec, FPS, bitrate.
