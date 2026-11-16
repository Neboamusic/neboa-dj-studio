# NEBØA DJ Studio v0.4.2-beta.1 — Reversible set planning

A new open-source beta focused on **safe, reversible DJ session preparation**, alongside a clearer independent artist identity.

## New in this beta

- **Undo / Redo:** restore up to the previous **30 playlist ordering changes**. Applies to manual track moves, harmonic sequence suggestions, tempo/energy sorting and resetting to the imported order.
- **No-op suppression and history isolation:** unchanged sorting produces no history entry. Editing after Undo clears Redo. Importing or selecting another playlist clears old history, preventing one DJ's session decisions from leaking into the next session.
- **Better identity:** the independent artist is displayed as **NEBØA · César López**, based in **Spain**, formerly known as **Cesare il Galo**. Updated Spanish and English biographies and GitHub profile link.
- **Documentation:** extended README, architecture notes and FAQ explaining in-memory undo behavior.
- **Tests:** **92 automated checks passed locally**: 74 JavaScript, 5 Python security and 13 FFmpeg tests using only synthetic audio.

## Try DJ Studio

- [Open the static browser demo](https://neboamusic.github.io/neboa-dj-studio/)
- [Read NEBØA's artist page](https://neboamusic.github.io/neboa-dj-studio/artist.html)
- [Download a fictional techno playlist](https://github.com/Neboamusic/neboa-dj-studio/blob/main/examples/fictional-hypnotic-techno.tsv)
- [Read the architecture and privacy safeguards](https://github.com/Neboamusic/neboa-dj-studio/blob/main/docs/ARCHITECTURE.md)

For measured LUFS and true peak or generation of new normalized FLAC, WAV or MP3 copies, install FFmpeg/FFprobe and Python locally and follow the documented preflight. The GitHub Pages demo **cannot** run the Python audio engine.

## Safety notes

This release is **beta software**. It does **not** overwrite audio, Rekordbox/OneLibrary databases, beatgrids, cues or USB contents. Ordering changes are made to browser memory only. Test audio is synthetic and no commercial recordings are bundled. Actual CDJ/XDJ hardware compatibility and large-library validation remain pending.

DJ Studio is independent of AlphaTheta, Pioneer DJ and Rekordbox. MIT licensed.
