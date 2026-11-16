# NEBØA DJ Studio v0.4.1-beta.2 — Artist & Community update

A new public beta with the complete original DJ Studio functionality, new artist identity materials, and better reproducible demo data.

## What's new

- **NEBØA artist profile:** official artist website and Spanish/English biography for **César López Caparrós**, formerly known as **Cesare il Galo**.
- **Identity and contact:** responsive branded artist page, connected from the app, GitHub repo and artist account. No fake credentials, events or music uploads.
- **Try the workflow safely:** a fully fictitious 10-track, 140–145 BPM hypnotic techno TSV example with synthetic artist names, BPM, key and energy. No copyrighted recordings.
- **Regression tests:** 69 JavaScript tests, 5 Python safety tests, 13 actual FFmpeg tests using audio generated exclusively for testing. **87 total** verified locally.
- The GitHub Pages demo, source repository, README and security documentation remain fully public.

## Start

- [DJ Studio web demo](https://neboamusic.github.io/neboa-dj-studio/)
- [NEBØA artist profile](https://neboamusic.github.io/neboa-dj-studio/artist.html)
- [Source repository](https://github.com/Neboamusic/neboa-dj-studio)
- [Fictional sample playlist](https://github.com/Neboamusic/neboa-dj-studio/blob/main/examples/fictional-hypnotic-techno.tsv)

For real LUFS and true peak workflows, install Python 3.10+ and FFmpeg/FFprobe locally and follow the README's preflight instructions. The hosted GitHub Pages demo is a browser-only frontend; it does not run server-side FFmpeg.

## Safety and scope

The software never changes original audio, cues or Rekordbox/OneLibrary databases. Audio rendering is an explicit opt-in action that writes new files only. This is **beta software**, not verified or certified for real CDJ/XDJ hardware or large libraries. The project has no official affiliation with AlphaTheta, Pioneer DJ or Rekordbox.

MIT licensed. No commercial recordings or device database dumps are included.
