# Security policy

NEBØA DJ Studio is a **beta**, local-first music workflow tool. The static browser application does not need an account or an Internet backend. The optional Python companion binds only to `127.0.0.1`, uses a per-process token, same-origin checks and temporary staging, and generates new copies rather than replacing source audio.

## Supported versions

The current beta series is `0.4.x`. Earlier versions are not maintained.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting / security advisory feature for `Neboamusic/neboa-dj-studio` when available. If a private reporting channel is unavailable, open an issue **without publishing exploitable details, secrets or private user data** and request a private way to share the report.

Do not upload real music libraries, Rekordbox databases, audio files, network inventories or personal contact data in security reports.

## Known limits

- No claim of certification or official interoperability with DJ hardware is made.
- Browser permissions and operating-system file-access restrictions still apply.
- Audio normalization requires the user's explicit choice, creates a new file only, and must not write to USB media or source music.
- Tests use synthetic audio. Independent security review and hardware validation are still pending.
