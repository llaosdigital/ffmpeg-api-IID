# POST /convert-audio

Descrição:
Converte qualquer mídia (vídeo ou áudio) em formato de áudio (ex: MP3, WAV, AAC).

- Faz download temporário do arquivo.
- Extrai o áudio via libmp3lame (44100Hz, estéreo, 192kbps).
- Retorna o binário do áudio convertido.
- Remove arquivos temporários após o envio.

# POST /convert-video

Descrição:
Converte um vídeo de qualquer formato para outro (ex: .mp4, .mov, .avi).

- Baixa o vídeo.
- Executa ffmpeg com libx264 (vídeo) e aac (áudio).
- Retorna o vídeo convertido.
- Limpa os arquivos temporários.

# POST /merge

Descrição:
Faz merge (concatenação) de múltiplos arquivos de áudio ou vídeo.

- Baixa todos os arquivos temporariamente.
- Gera um arquivo list.txt para concatenação.
- Executa ffmpeg -f concat -safe 0 -i list.txt -c copy output.
- Retorna o arquivo final.
- Apaga todos os temporários e o arquivo de lista.
