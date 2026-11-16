# Frequently asked questions

### Do I need Rekordbox?

No. DJ Studio can import CSV/TSV/JSON playlists and includes a synthetic sample. For a shareable example, use the [fictional hypnotic-techno TSV playlist](../examples/fictional-hypnotic-techno.tsv); all names and metadata are invented and no audio is included. For analysis of your Rekordbox collection, export XML through the official application.

### Does it write to my USB or Rekordbox library?

No. The USB inspector has read-only behavior. Detecting an OneLibrary database does **not** mean DJ Studio supports writing or validating that binary database.

### Does it include licensed music?

No. The project includes only code, documentation and synthetic fixtures. You supply your own audio with the necessary rights.

### Can I run it offline?

The static UI works locally without a login or Internet connection. Actual loudness normalization additionally requires Python 3.10+, FFmpeg and FFprobe installed on your machine.

### Will normalization replace my track?

Never. It creates a new output file only after explicit confirmation, with no-overwrite behavior. The original file and your cue points remain untouched.

### Does it hit exactly -11 LUFS?

Not necessarily. DJ Studio prioritizes the configured true-peak ceiling over loudness. It will refuse unsafe gain and does not hide a compressor/limiter in the pipeline.

### Can I export playlists to an XDJ-AZ?

Not directly. Import the authorized files into compatible DJ software, export using its documented OneLibrary workflow, and test on the actual hardware.

### Can this be used at a gig?

It is a beta, not yet validated with all browser versions, large libraries or DJ hardware. Keep a fully verified Rekordbox backup and use an officially exported, tested USB for performance.

### Is NEBØA affiliated with AlphaTheta, Pioneer DJ or Rekordbox?

No. The project is independently developed by NEBØA.
