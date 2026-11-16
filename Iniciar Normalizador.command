#!/bin/zsh
# DJ Studio Normalizer — user-initiated, foreground, loopback-only.
# Stops when this Terminal process ends (Ctrl+C).
set -euo pipefail
cd -- "$(dirname -- "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  echo "Se necesita Python 3.10 o posterior instalado en este Mac."
  read -r '?Pulsa Enter para salir.'
  exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
fi
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "Se necesita FFmpeg + FFprobe en el PATH. No se instalará automáticamente."
  read -r '?Pulsa Enter para salir.'
  exit 1
fi
if [[ -d "$HOME/NEBOA" && "$PWD" == "$HOME/NEBOA/"* ]]; then
  OUTPUT_DIR="$HOME/NEBOA/exports/normalized"
else
  OUTPUT_DIR="$HOME/Music/DJStudio-Normalized"
fi
echo "DJ Studio: normalizador LOCAL"
echo "Output: $OUTPUT_DIR"
echo "Nunca modifica originales ni OneLibrary."
echo "Comprobando espacio libre antes de iniciar..."
PREFLIGHT=$(python3 normalizer.py preflight --output-dir "$OUTPUT_DIR")
echo "$PREFLIGHT"
if [[ "$PREFLIGHT" != *'"safe_to_render": true'* ]]; then
  echo "Normalización pausada: libera espacio antes de procesar música."
  echo "Se necesita una reserva mínima de 1,1 GiB más el tamaño estimado de cada copia."
  read -r '?Pulsa Enter para salir.'
  exit 2
fi
echo "Se abrirá una pestaña en tu navegador. Para detener: Ctrl+C."
(
  sleep 1.2
  open "http://127.0.0.1:18766/" >/dev/null 2>&1 || true
) &
exec python3 normalizer.py serve --output-dir "$OUTPUT_DIR"
