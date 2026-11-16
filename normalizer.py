#!/usr/bin/env python3
"""DJ Studio desktop companion: explicit, non-destructive LUFS/true-peak normalizer.

Dependencies: Python >=3.10 (stdlib), FFmpeg, FFprobe. No cloud, accounts or
persistent services. Web mode listens ONLY on 127.0.0.1, uses one-time random
session token, one selected audio at a time, and refuses USB/external output.
Input audio is never rewritten; normalized output is a new file only on a
user-initiated render request and is independently measured before publish.

Principle: pure LINEAR GAIN, capped by measured true-peak headroom. We do NOT
invoke loudnorm as the output processor (which can silently switch to dynamic).
"""
from __future__ import annotations

import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import math
import mimetypes
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import unquote, urlparse

VERSION = "0.4.1"
MAX_UPLOAD = 128 * 1024 * 1024
MIN_FREE_BYTES = 1100 * 1024 * 1024
ALLOWED_INPUT = {".mp3", ".wav", ".flac", ".aif", ".aiff", ".m4a", ".aac"}
SUPPORTED_OUTPUT = {"flac", "wav", "mp3"}
BIND_HOST = "127.0.0.1"
BIND_PORT = 18766
STATIC = {"index.html", "core.js", "usb.js", "tags.js", "app.js",
          "normalizer-ui.js", "styles.css"}
TARGETS = {-16, -14, -12, -11, -10, -9}
DEFAULT_TARGET = -11.0
CEILING_DBTP = -1.5
MAX_BOOST_DB = 6.0
UPLOAD_SAFETY_MARGIN_DB = 0.45
ENCODING_MP3_MARGIN_DB = 0.6


class NormalizationError(Exception):
    pass


def _safe_name(filename: str) -> str:
    # Accept only a basename to prevent traversal or overwrites.
    candidate = filename.replace("\\", "/").split("/")[-1]
    clean = re.sub(r"[\x00-\x1f<>:\"/\\|?*]", "_", candidate).strip(" .")
    if not clean or clean.startswith(".") or len(clean) > 160:
        raise NormalizationError("Nombre de archivo no válido")
    if Path(clean).suffix.lower() not in ALLOWED_INPUT:
        raise NormalizationError("Formato de audio no admitido para normalización")
    return clean


def _ffmpeg_commands() -> tuple[str, str]:
    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise NormalizationError("Instala FFmpeg y FFprobe para medición LUFS real")
    return ffmpeg, ffprobe


def _run(cmd: list[str], timeout: int = 150) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(cmd, shell=False, capture_output=True,
                                text=True, errors="replace", timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise NormalizationError("El proceso de audio ha agotado el tiempo máximo") from exc
    except OSError as exc:
        raise NormalizationError("FFmpeg/FFprobe no se puede ejecutar") from exc
    if result.returncode:
        raise NormalizationError("El análisis o codificación ha fallado; comprueba que el audio esté íntegro")
    return result


def sha256_file(path: Path) -> str:
    """Stream a source fingerprint; never load a DJ track fully into memory."""
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_audio(path: Path) -> dict:
    _, ffprobe = _ffmpeg_commands()
    if not path.is_file() or path.is_symlink() or path.suffix.lower() not in ALLOWED_INPUT:
        raise NormalizationError("Audio inexistente, enlace simbólico o formato incompatible")
    if path.stat().st_size <= 0:
        raise NormalizationError("Archivo de audio vacío")
    result = _run([ffprobe, "-v", "error", "-select_streams", "a:0",
                   "-show_entries", "stream=codec_name,channels,sample_rate,duration:format=duration",
                   "-of", "json", str(path)], timeout=35)
    try:
        obj = json.loads(result.stdout)
        stream = obj["streams"][0]
        duration = float(stream.get("duration") or obj.get("format", {}).get("duration"))
        channels, rate = int(stream["channels"]), int(stream["sample_rate"])
        codec = stream["codec_name"]
    except (ValueError, TypeError, KeyError, IndexError) as exc:
        raise NormalizationError("FFprobe no ha identificado un audio válido") from exc
    if not 0.1 < duration <= 4 * 60 * 60 or channels not in (1, 2) or not 8000 <= rate <= 192000:
        raise NormalizationError("Duración, canales o frecuencia de muestreo fuera de los límites")
    return {"duration_seconds": round(duration, 2), "channels": channels,
            "sample_rate": rate, "codec": codec, "bytes": path.stat().st_size}


def parse_loudnorm(text: str) -> dict:
    """Extract FFmpeg's first-pass loudnorm stats, without trusting warnings."""
    patterns = re.findall(r'\{\s*"input_i"\s*:\s*"[^"]+"[\s\S]*?\}', text)
    if not patterns:
        raise NormalizationError("FFmpeg no ha proporcionado LUFS/true peak verificables")
    try:
        metrics = json.loads(patterns[-1])
        loudness = float(metrics["input_i"])
        true_peak = float(metrics["input_tp"])
        lra = float(metrics["input_lra"])
        threshold = float(metrics["input_thresh"])
    except (KeyError, ValueError, TypeError, json.JSONDecodeError) as exc:
        raise NormalizationError("FFmpeg devolvió métricas de sonoridad inválidas") from exc
    if any(not math.isfinite(v) for v in (loudness, true_peak, lra, threshold)):
        raise NormalizationError("El archivo es silencioso o las medidas LUFS no son válidas")
    if not (-70 <= loudness <= 5 and -120 <= true_peak <= 15 and 0 <= lra <= 99):
        raise NormalizationError("Medición acústica fuera de límites plausibles")
    return {"integrated_lufs": round(loudness, 2), "true_peak_dbtp": round(true_peak, 2),
            "lra_lu": round(lra, 2), "threshold_lufs": round(threshold, 2)}


def measure(path: Path) -> dict:
    ffmpeg, _ = _ffmpeg_commands()
    metadata = inspect_audio(path)
    # Use loudnorm only as a *measurement* (print_format=json); no output write.
    mono = ":dual_mono=true" if metadata["channels"] == 1 else ""
    proc = _run([ffmpeg, "-nostdin", "-hide_banner", "-v", "info",
                 "-i", str(path), "-map", "0:a:0", "-vn", "-sn", "-dn",
                 "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json" + mono,
                 "-f", "null", "-"], timeout=200)
    return {**metadata, **parse_loudnorm(proc.stderr), "source_sha256": sha256_file(path)}


def make_plan(measurements: dict, target: float = DEFAULT_TARGET,
              ceiling: float = CEILING_DBTP, output_format: str = "flac") -> dict:
    if target not in TARGETS or output_format not in SUPPORTED_OUTPUT:
        raise NormalizationError("Objetivo de LUFS o formato no permitido")
    measured_lufs = float(measurements["integrated_lufs"])
    tp = float(measurements["true_peak_dbtp"])
    if not math.isfinite(measured_lufs) or not math.isfinite(tp):
        raise NormalizationError("Mediciones inválidas para normalizar")
    requested_gain = round(target - measured_lufs, 2)
    safety = ENCODING_MP3_MARGIN_DB if output_format == "mp3" else UPLOAD_SAFETY_MARGIN_DB
    max_peak_gain = ceiling - tp - safety
    gain = round(min(requested_gain, MAX_BOOST_DB, max_peak_gain), 2)
    if gain < -30:
        raise NormalizationError("Necesitaría una atenuación extrema: revisa el archivo")
    predicted = round(measured_lufs + gain, 2)
    projected_tp = round(tp + gain, 2)
    reasons = []
    if gain < requested_gain - 0.06:
        if requested_gain > MAX_BOOST_DB:
            reasons.append("Aumento limitado a +6 dB para no amplificar excesivamente ruido de fondo.")
        if max_peak_gain < requested_gain:
            reasons.append("Ganancia limitada por true peak y margen de seguridad. NO se comprime el audio.")
        reasons.append("No se alcanzará exactamente el objetivo LUFS; prioridad a dinámica y techo de pico.")
    if output_format == "mp3":
        reasons.append("MP3 implica recodificación con pérdida; no recupera calidad del original.")
    elif Path(str(measurements.get("filename", ""))).suffix.lower() in (".mp3", ".aac", ".m4a"):
        reasons.append("FLAC/WAV evita otra compresión con pérdida, pero NO mejora la fuente con pérdida.")
    reasons.append("No se escriben tags de ReplayGain ni se modifica master.db/OneLibrary.")
    return {"target_lufs": target, "ceiling_dbtp": ceiling,
            "requested_gain_db": requested_gain, "applied_gain_db": gain,
            "predicted_lufs": predicted, "predicted_true_peak_dbtp": projected_tp,
            "output_format": output_format,
            "exact_target_possible": abs(predicted - target) <= 0.1,
            "method": "GAIN_ONLY_NO_COMPRESSOR_NO_LIMITER", "warnings": reasons}


def _free_space_guard(directory: Path, required_output: int = 0) -> None:
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    remaining = shutil.disk_usage(directory).free
    if remaining < MIN_FREE_BYTES + required_output:
        raise NormalizationError("Espacio insuficiente: se mantienen 1,1 GiB de reserva; libera espacio antes de crear copias")


def _output_dir(output_dir: Path) -> Path:
    # Never render into the selected USB. Output must be under the user's home.
    home = Path.home().resolve()
    dest = output_dir.expanduser().resolve()
    if not dest.is_relative_to(home):
        raise NormalizationError("Las copias normalizadas deben guardarse dentro de tu carpeta de usuario")
    if dest.exists() and dest.stat().st_dev != home.stat().st_dev:
        raise NormalizationError("El destino está en otro volumen: no se escribe directamente a un USB")
    if any(p in dest.parts for p in ("Volumes", "Media", "media", "mnt")) and dest.parts[:2] == ("/", "Volumes"):
        raise NormalizationError("La salida directa a un pendrive está bloqueada")
    _free_space_guard(dest)
    return dest


def _estimate_output_bytes(info: dict, fmt: str) -> int:
    duration = info["duration_seconds"]
    if fmt == "wav":
        return int(duration * min(96000, info["sample_rate"]) * 2 * 3 * 1.15)
    if fmt == "mp3":
        return int(duration * 40000 * 1.2)
    # FLAC upper estimate conservatively close to 24-bit WAV.
    return int(duration * min(96000, info["sample_rate"]) * 2 * 3 * 1.1)


def preflight_info(output_dir: Path) -> dict:
    """Read-only readiness report. Never creates a folder, audio or USB output."""
    home = Path.home().resolve()
    dest = output_dir.expanduser().resolve()
    if not dest.is_relative_to(home):
        raise NormalizationError("La carpeta de salida debe estar dentro del home del DJ")
    existing = dest
    while not existing.exists():
        existing = existing.parent
    if not existing.is_dir() or existing.stat().st_dev != home.stat().st_dev:
        raise NormalizationError("La carpeta de destino pertenece a otro volumen; no usar un USB")
    usage = shutil.disk_usage(existing)
    tools_ready = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))
    return {
        "version": VERSION,
        "output_dir": str(dest),
        "available_bytes": usage.free,
        "reserve_bytes": MIN_FREE_BYTES,
        "safe_to_render": tools_ready and usage.free >= MIN_FREE_BYTES,
        "ffmpeg_available": tools_ready,
        "creates_files": False,
        "warning": "" if tools_ready and usage.free >= MIN_FREE_BYTES else
            "No se pueden crear copias: falta FFmpeg o espacio libre suficiente."
    }


def normalized_copy(path: Path, output_dir: Path, measured: dict,
                    target: float = DEFAULT_TARGET, fmt: str = "flac") -> dict:
    """Render an authorized new copy, verify, then publish. Original untouched."""
    # Verify the source identity before checking optional encoder availability:
    # rejecting a stale preview must work even on hosts without FFmpeg.
    if path.is_symlink():
        raise NormalizationError("No se normalizan enlaces simbólicos")
    before = inspect_audio(path)
    # Input must be the same source as when preview was measured.
    if before["bytes"] != measured.get("bytes") or before["duration_seconds"] != measured.get("duration_seconds"):
        raise NormalizationError("El audio ha cambiado desde la medición: vuelve a analizarlo")
    source_hash = measured.get("source_sha256")
    if not source_hash or sha256_file(path) != source_hash:
        raise NormalizationError("La huella SHA-256 del audio ha cambiado: vuelve a medirlo")
    ffmpeg, _ = _ffmpeg_commands()
    plan = make_plan(measured, target, CEILING_DBTP, fmt)
    destination_dir = _output_dir(output_dir)
    _free_space_guard(destination_dir, _estimate_output_bytes(before, fmt) + path.stat().st_size // 4)
    base = re.sub(r"[^A-Za-z0-9._ -]", "_", path.stem).strip(" .")[:75] or "pista"
    suffix = f"__NORMALIZED_{int(abs(target))}LUFS_{fmt}"
    sample_rate = before["sample_rate"] if before["sample_rate"] in (44100, 48000, 88200, 96000) else 48000
    name = f"{base}{suffix}.{fmt}"
    dest = destination_dir / name
    if dest.exists() or dest.is_symlink():
        raise NormalizationError("La copia de salida ya existe: no se sobrescribirá")
    fd, temp_name = tempfile.mkstemp(prefix=".djstudio.", suffix="."+fmt, dir=destination_dir)
    os.close(fd)
    temp = Path(temp_name)
    try:
        # FFmpeg -y is safe ONLY for the newly created PRIVATE temp filename.
        filter_gain = f"volume={plan['applied_gain_db']:+.2f}dB"
        cmd = [ffmpeg, "-nostdin", "-hide_banner", "-v", "error", "-y",
               "-i", str(path), "-map", "0:a:0", "-map_metadata", "-1",
               "-map_chapters", "-1", "-vn", "-sn", "-dn",
               "-af", filter_gain, "-ac", "2", "-ar", str(sample_rate)]
        if fmt == "wav":
            cmd += ["-c:a", "pcm_s24le", "-f", "wav"]
        elif fmt == "flac":
            cmd += ["-c:a", "flac", "-sample_fmt", "s32",
                    "-bits_per_raw_sample", "24", "-compression_level", "5", "-f", "flac"]
        else:
            cmd += ["-c:a", "libmp3lame", "-b:a", "320k", "-f", "mp3"]
        _run(cmd + [str(temp)], timeout=240)
        if not temp.is_file() or temp.stat().st_size <= 500:
            raise NormalizationError("No se ha creado una copia de audio verificable")
        verification = measure(temp)
        if sha256_file(path) != source_hash:
            raise NormalizationError("El original ha cambiado durante el procesamiento; copia descartada")
        if abs(verification["duration_seconds"] - before["duration_seconds"]) > 0.5:
            raise NormalizationError("La duración de la copia no coincide con el audio original")
        if verification["true_peak_dbtp"] > CEILING_DBTP + 0.12:
            raise NormalizationError("La copia supera el límite true peak y ha sido descartada")
        if abs(verification["integrated_lufs"] - plan["predicted_lufs"]) > 1.15:
            raise NormalizationError("La sonoridad final difiere del plan: se ha descartado la copia")
        # Atomic no-overwrite publish on the same volume. Hard link will FAIL if
        # someone created the destination while we were verifying.
        try:
            os.link(temp, dest)
        except FileExistsError as exc:
            raise NormalizationError("Ya existe esa copia; nunca se sobrescriben archivos") from exc
        # Remove temporary link, leaving only published output.
        temp.unlink(missing_ok=True)
        return {"status": "VERIFIED_NEW_COPY", "filename": dest.name,
                "output_path": str(dest), "output_bytes": dest.stat().st_size,
                "format": fmt, "target_lufs": target,
                "before": measured, "plan": plan, "after": verification,
                "original_sha256": source_hash,
                "copy_sha256": verification["source_sha256"],
                "original_unchanged": True, "output_dir": str(destination_dir),
                "notice": "Copia nueva; no sustituye ni actualiza las rutas/cues originales de Rekordbox."}
    finally:
        temp.unlink(missing_ok=True)


def _clean_host(raw_host: str) -> bool:
    return raw_host in {f"127.0.0.1:{BIND_PORT}", f"localhost:{BIND_PORT}"}


def create_server(output_dir: Path, bind_port: int = BIND_PORT) -> tuple[HTTPServer, dict]:
    """HTTP Server bound to loopback. Session token required for all POSTs."""
    _ffmpeg_commands()
    dest = _output_dir(output_dir)
    token = secrets.token_urlsafe(40)
    parent = Path(__file__).resolve().parent
    home = Path.home()
    stage_base = home / "NEBOA" / ".cache" / "djstudio" if (
        home / "NEBOA").is_dir() and parent.is_relative_to(home / "NEBOA") else home / ".cache" / "djstudio"
    stage_base.mkdir(mode=0o700, parents=True, exist_ok=True)
    stage_dir = Path(tempfile.mkdtemp(prefix="djstudio-session-", dir=stage_base))
    state = {"token": token, "stage_dir": stage_dir, "file": None,
             "display_name": None, "measurements": None, "staging_id": None, "output_dir": dest,
             "port": bind_port}

    class Handler(BaseHTTPRequestHandler):
        server_version = "DJStudioLocal/0.4.1"
        def log_message(self, format, *args):
            # No media file names or tokens in service logs.
            sys.stderr.write("DJ Studio local: " + format % args + "\n")

        def _headers(self, code: int, content_type: str = "application/json",
                     size: int | None = None):
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Cross-Origin-Resource-Policy", "same-origin")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Content-Security-Policy",
                "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self';"
                " img-src 'self' data: blob:; font-src 'self'; object-src 'none'; base-uri 'none'")
            if size is not None:
                self.send_header("Content-Length", str(size))
            self.end_headers()

        def _json(self, code: int, payload: dict):
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self._headers(code, "application/json; charset=utf-8", len(data))
            self.wfile.write(data)

        def _forbidden(self) -> bool:
            host = self.headers.get("Host", "")
            origin = self.headers.get("Origin")
            if host not in {f"127.0.0.1:{bind_port}", f"localhost:{bind_port}"}:
                return True
            if origin is not None and origin not in {
                    f"http://127.0.0.1:{bind_port}", f"http://localhost:{bind_port}"}:
                return True
            if self.headers.get("Sec-Fetch-Site", "") == "cross-site":
                return True
            return False

        def _check_post(self) -> bool:
            if self._forbidden() or self.headers.get("X-DJ-Token") != token:
                self._json(403, {"error": "Petición no autorizada a companion local"})
                return False
            return True

        def do_OPTIONS(self):
            # Never grant CORS to third-party websites.
            self._headers(405)
        def do_GET(self):
            if self._forbidden():
                self._json(403, {"error": "Host u origen no autorizado"})
                return
            parsed=urlparse(self.path)
            if parsed.path == "/api/session":
                self._json(200, {"active": True, "version": VERSION, "token": token,
                    "formats": sorted(SUPPORTED_OUTPUT), "targets": sorted(TARGETS),
                    "output_dir": str(dest), "max_upload_bytes": MAX_UPLOAD,
                    "staged": state["file"] is not None})
                return
            filename = parsed.path.removeprefix("/")
            if filename == "":
                filename="index.html"
            if filename not in STATIC:
                self._json(404, {"error":"Ruta no permitida"})
                return
            target=(parent/filename).resolve()
            if target.parent != parent or not target.is_file():
                self._json(404, {"error":"Archivo no disponible"})
                return
            data=target.read_bytes()
            content_type=mimetypes.guess_type(filename)[0] or "application/octet-stream"
            if filename.endswith(".js"):content_type="application/javascript"
            self._headers(200, content_type+"; charset=utf-8",len(data))
            self.wfile.write(data)

        def do_POST(self):
            if not self._check_post():return
            parsed=urlparse(self.path)
            if parsed.path == "/api/analyze":
                self._analyze()
            elif parsed.path == "/api/render":
                self._render()
            elif parsed.path == "/api/plan":
                self._plan()
            else:
                self._json(404, {"error": "Ruta desconocida"})

        def _analyze(self):
            staged = None
            try:
                content_len=int(self.headers.get("Content-Length","0"))
                if content_len <= 0 or content_len > MAX_UPLOAD:
                    raise NormalizationError("Audio vacío o >128 MiB: usa el CLI para pistas grandes")
                file_name = _safe_name(unquote(self.headers.get("X-File-Name","audio.mp3")))
                _free_space_guard(stage_dir, content_len*3)
                # One selected audio at a time; never leave previous staged tracks.
                previous = state.get("file")
                if previous and Path(previous).exists():
                    Path(previous).unlink()
                state.update({"file":None,"measurements":None,"display_name":None,"staging_id":None})
                staged = stage_dir/file_name
                with staged.open("xb") as out:
                    bytes_left=content_len
                    while bytes_left:
                        chunk=self.rfile.read(min(bytes_left, 1024*1024))
                        if not chunk:
                            raise NormalizationError("Subida local interrumpida")
                        out.write(chunk)
                        bytes_left-=len(chunk)
                measured=measure(staged)
                measured["filename"]=file_name
                state.update({"file":staged,"display_name":file_name,"measurements":measured,
                              "staging_id":secrets.token_urlsafe(18)})
                self._json(200,{"filename":file_name,"measurements":measured,
                    "staging_id":state["staging_id"],
                    "plan":make_plan(measured),"source_kept_only_in_local_temp":True})
            except (NormalizationError, OSError, ValueError) as exc:
                if staged and staged.exists():staged.unlink()
                current=state.get("file")
                if current and Path(current).exists():Path(current).unlink()
                state.update({"file":None,"measurements":None,"display_name":None,"staging_id":None})
                self._json(422,{"error":str(exc)})

        def _plan(self):
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > 4096:
                    raise NormalizationError("Solicitud de propuesta inválida")
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                if not state.get("measurements"):
                    raise NormalizationError("Primero analiza el audio")
                if payload.get("staging_id") != state.get("staging_id"):
                    raise NormalizationError("El audio ha cambiado: vuelve a analizar la pista")
                target = float(payload.get("target", DEFAULT_TARGET))
                fmt = str(payload.get("format", "flac")).lower()
                self._json(200, {"plan": make_plan(state["measurements"], target, CEILING_DBTP, fmt)})
            except (NormalizationError, ValueError, json.JSONDecodeError) as exc:
                self._json(422, {"error": str(exc)})

        def _render(self):
            try:
                length=int(self.headers.get("Content-Length","0"))
                if length<=0 or length>4096:
                    raise NormalizationError("Petición de copia demasiado grande")
                payload=json.loads(self.rfile.read(length).decode("utf-8"))
                target=float(payload.get("target", DEFAULT_TARGET))
                fmt=str(payload.get("format","flac")).lower()
                if target not in TARGETS or fmt not in SUPPORTED_OUTPUT:
                    raise NormalizationError("Objetivo LUFS o formato no admitidos")
                if not state.get("file") or not state.get("measurements"):
                    raise NormalizationError("Primero selecciona y analiza un audio local")
                if payload.get("staging_id") != state.get("staging_id"):
                    raise NormalizationError("El audio ha cambiado: vuelve a analizar la pista")
                result=normalized_copy(state["file"], dest,state["measurements"],target,fmt)
                # Temporary uploaded source no longer needed; never leave it in
                # cache after user finishes creating the output.
                Path(state["file"]).unlink(missing_ok=True)
                state.update({"file":None,"measurements":None,"display_name":None,"staging_id":None})
                self._json(200,result)
            except (NormalizationError, ValueError, OSError, json.JSONDecodeError) as exc:
                self._json(422,{"error":str(exc)})

    server=HTTPServer((BIND_HOST,bind_port),Handler)
    server.timeout=1
    return server,state


def main(argv: list[str] | None = None) -> int:
    parser=argparse.ArgumentParser(description="DJ Studio local-only loudness + safe gain copy")
    sub=parser.add_subparsers(dest="command",required=True)
    ready=sub.add_parser("preflight",help="Check FFmpeg and disk space without creating files")
    ready.add_argument("--output-dir",default=str(Path.home()/"DJStudio-Normalized"))
    serve=sub.add_parser("serve",help="Open local-only browser companion at 127.0.0.1:18766")
    serve.add_argument("--output-dir",default=str(Path.home()/"DJStudio-Normalized"))
    analyze=sub.add_parser("analyze",help="Analyze an explicit existing audio file; no writes")
    analyze.add_argument("file")
    render=sub.add_parser("render",help="Explicitly make a new normalized copy (never overwrite)")
    render.add_argument("file")
    render.add_argument("--target",type=float,choices=sorted(TARGETS),default=DEFAULT_TARGET)
    render.add_argument("--format",choices=sorted(SUPPORTED_OUTPUT),default="flac")
    render.add_argument("--output-dir",default=str(Path.home()/"DJStudio-Normalized"))
    args=parser.parse_args(argv)
    try:
        if args.command=="preflight":
            print(json.dumps(preflight_info(Path(args.output_dir)),ensure_ascii=False,indent=2))
            return 0
        if args.command=="analyze":
            data=measure(Path(args.file).expanduser())
            data["filename"]=Path(args.file).name
            print(json.dumps({"measurements":data,"plan":make_plan(data)},
                             ensure_ascii=False,indent=2))
            return 0
        if args.command=="render":
            path=Path(args.file).expanduser()
            data=measure(path)
            data["filename"]=path.name
            result=normalized_copy(path,Path(args.output_dir),data,args.target,args.format)
            print(json.dumps(result,ensure_ascii=False,indent=2))
            return 0
        if args.command=="serve":
            server,state=create_server(Path(args.output_dir))
            address=f"http://127.0.0.1:{BIND_PORT}/"
            print("DJ Studio Normalizer local:",address,
                  "\nMediciones LUFS reales; copias solo con botón explícito.",
                  "\nSalida:",state["output_dir"],
                  "\nDetener: Ctrl+C. No se envía ningún archivo a Internet.",flush=True)
            try:
                server.serve_forever(poll_interval=0.3)
            except KeyboardInterrupt:
                pass
            finally:
                server.server_close()
                shutil.rmtree(state["stage_dir"],ignore_errors=True)
            return 0
    except (NormalizationError,OSError) as exc:
        print("ERROR:",str(exc),file=sys.stderr)
        return 2
    return 1


if __name__=="__main__":
    raise SystemExit(main())
