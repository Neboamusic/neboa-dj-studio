# DJ Studio by NEBØA — v0.4.1-beta.1

First **open-source public beta**, released under the MIT License.

### What's included
- Local-first DJ session planning with Rekordbox XML, CSV/TSV and JSON imports.
- Camelot/BPM/energy guidance, Mix Coach and suggested cue points.
- Read-only, user-authorized USB inventory and MP3/FLAC tag inspection.
- Optional Python 3.10+ and FFmpeg companion for EBU R128 / true-peak measurements.
- Explicitly authorized **new** FLAC, WAV or MP3 normalizations; gain-only processing, SHA-256 integrity checks and no overwriting originals.
- Local CSV/JSON exports and normalization quality audit; no commercial music recordings are bundled.

### Tested
- 64 JavaScript tests
- 5 Python safety tests, including rejection of changed sources without requiring FFmpeg
- 13 Python/FFmpeg tests using synthetic audio

All **82 automated tests** passed locally, and the repository's three GitHub Actions jobs passed after the source-integrity fix.

### Use the project
- [Repository and instructions](https://github.com/Neboamusic/neboa-dj-studio)
- [Browser-only demo](https://neboamusic.github.io/neboa-dj-studio/)
- [Architecture and privacy](https://github.com/Neboamusic/neboa-dj-studio/blob/main/docs/ARCHITECTURE.md)

The hosted demo runs only the static browser tools. For actual audio normalization, run the companion locally using the documented preflight.

### Important limits
**Beta software:** Not validated on actual CDJ/XDJ hardware, with all major browsers, or across large external DJ libraries. No official affiliation with AlphaTheta, Pioneer DJ or Rekordbox. The tool does not modify Rekordbox/OneLibrary databases, source audio, metadata, beatgrids, cues or USB exports.

The v0.4.1-beta.1 Git tag marks the initial published source and fix. Subsequent README, branding and GitHub Pages updates are available on the `main` branch.
