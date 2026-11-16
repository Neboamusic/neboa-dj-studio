# Architecture · NEBØA DJ Studio

## Philosophy

**Local-first, DJ-controlled, read-only by default.** The application does not need a cloud account or a hosted backend. It separates *planning a DJ set*, *inspecting files*, and *explicitly rendering new audio copies*. None of these processes edits a Rekordbox collection or USB database.

## Modules

| Module | Runtime | Inputs | Output |
| --- | --- | --- | --- |
| `core.js` | Browser | User-imported XML, CSV or synthetic example | Playlist order, Camelot recommendations and cue ideas |
| `usb.js` + `tags.js` | Browser | User-selected local directory / ID3 or FLAC metadata | USB inventory and quality CSV |
| `app.js` | Browser | User actions and Web Audio when explicitly invoked | Preview, export and dashboard state |
| `normalizer-ui.js` | Browser | Selected audio, targets and user confirmation | Authorized calls to local companion |
| `normalizer.py` | Python + FFmpeg | Selected temporary audio | LUFS/true-peak analysis and newly encoded verified copy |

## Browser-only mode

```text
Rekordbox XML / CSV / JSON  →  browser memory  →  playlist, Mix Coach, Cue Lab
User-selected USB directory → browser read-only → inventory, tags, CSV report
Optional explicit audio     → Web Audio          → indicative peak / RMS
```

No automatic scanning, collection synchronization, commercial music library, analytics, account system or third-party API.

## Optional normalization companion

```text
User-selected audio
       │ explicit action
       ▼
127.0.0.1:18766  ── token + same-origin checks ──► temporary private staging
       │                                             │
       │                                    FFmpeg loudnorm measurement
       │                                             │
       │                                SHA-256 identity + true peak plan
       │                                             │ explicit confirmation
       │                                             ▼
       │                                 gain-only FFmpeg new encoding
       │                                             │
       │                                   independent LUFS/TP re-check
       ▼                                             ▼
Browser result                               New FLAC / WAV / MP3 copy
                                              (never overwrites original)
```

The Python server binds **only to `127.0.0.1`**. There is no CORS authorization for arbitrary origins. User-provided files are held in a temporary private staging directory and removed after use. Generated audio is kept locally in the user's chosen permitted destination.

- Output is constrained to local home-directory storage, never directly to mounted USB or an external volume.
- Source size, duration and SHA-256 are validated before encoding. The source SHA-256 is checked again during the output verification phase.
- Copies are published without overwriting existing files. Applied gain respects true-peak headroom and does not silently switch to dynamic loudness normalization.
- A free-space preflight blocks unsafe runs; no background worker is installed by default.
- **No Rekordbox database**, cue/grid, library metadata or source track is modified.

## Confidence and interoperability

- Key/BPM/energy are never invented: missing fields remain unknown.
- Matching by artist and title is approximate, not cryptographic proof that two editions are the same track.
- Detecting `exportLibrary.db` only proves that the *file* exists, not that OneLibrary internal playlists or cue points have been parsed.
- Official device export must be performed by supported DJ software, followed by a hardware load test.

## Threat boundaries

Do not introduce telemetry, remote audio upload, background USB monitoring, cross-origin file access, vendor DB writers, unconsented format conversion or auto-updating of music libraries. Changes affecting any of these properties require a security and privacy review and explicit opt-in.

## Current verification

64 JS tests + 5 security Python tests + 13 synthetic-audio FFmpeg tests were run locally for the v0.4.1 beta. This does **not** certify hardware compatibility, real-library performance or a public commercial service.
