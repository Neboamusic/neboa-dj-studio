# NEBØA DJ Studio — v0.4.2-beta.2

Public beta by **NEBØA (César López)**, formerly known as **Cesare il Galo**. Independent from FINDSPO and Leanspots, with source code under the MIT License.

## What's included

- All features from v0.4.2-beta.1: local-first playlist import, Mix Coach, read-only USB inspection, and reversible set order with up to 30 undo/redo changes.
- Artist page and profile in English and Spanish, with independent NEBØA visual identity.
- Improved public site discovery: canonical URLs, Open Graph URLs, responsive social cards, a valid sitemap and local web manifest.
- Privacy-first web demo on GitHub Pages. No music cloud, bundled songs, hidden telemetry, USB database writes or automatic edits of original tracks.
- Optional local Python/FFmpeg normalizer: explicitly authorized new copies with source SHA-256 protection and output checks. It does **not** run in the hosted demo.

## Verification

- **95 automated local checks passed:** 77 JavaScript + 5 Python safety + 13 Python audio/FFmpeg tests using synthesized tracks.
- GitHub Actions JavaScript/Python/FFmpeg checks and GitHub Pages deployment verified against the live public repository.
- The public site, artist page, sitemap and manifest returned HTTP 200.

## Links

- [Use DJ Studio — browser demo](https://neboamusic.github.io/neboa-dj-studio/)
- [About NEBØA — artist page](https://neboamusic.github.io/neboa-dj-studio/artist.html)
- [Source and setup](https://github.com/Neboamusic/neboa-dj-studio)
- [Contribution guide](https://github.com/Neboamusic/neboa-dj-studio/blob/main/CONTRIBUTING.md)
- [Architecture and privacy](https://github.com/Neboamusic/neboa-dj-studio/blob/main/docs/ARCHITECTURE.md)

## Known limits

**Beta:** browser UI and synthetic-audio testing do not prove hardware compatibility with CDJ/XDJ, Rekordbox OneLibrary or any performance USB. Back up your library and verify an officially exported USB on the actual DJ hardware. The remote FFmpeg node remains unconfigured and requires authorized SSH access; no music libraries or USB media were modified. The software is not affiliated with or endorsed by AlphaTheta, Pioneer DJ or Rekordbox.
