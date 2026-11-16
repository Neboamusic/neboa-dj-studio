# Contributing to NEBØA DJ Studio

Thanks for helping improve DJ Studio. This is an independent, local-first, open-source DJ utility, currently **beta software**, licensed under MIT.

## Ways to contribute

- Open an issue describing a reproducible bug or focused enhancement.
- Propose accessible interface improvements, performance fixes, test cases or translations.
- Open a pull request against `main` after running the tests below.
- Keep changes small, explain expected behavior and provide tests with any bug fix.

## Local development

No Node package install is required for the basic browser app.

```sh
node --test tests/*.test.js
python3 -m unittest discover -s tests -p test_safety_v041.py -v
```

The optional full normalizer suite needs FFmpeg/FFprobe, temporary disk space, and Python 3.10+:

```sh
python3 -m unittest discover -s tests -p test_normalizer.py -v
```

The test suite synthesizes its own temporary audio. It does not need anyone's actual music files.

## Responsible data handling

**Never commit or attach** copyrighted music, USB exports, Rekordbox private databases, playlist names from real users, credentials, fingerprints, personal paths, access tokens or nonconsensual metadata. Use synthetic playlists and deliberately invented track names.

Do not write to a user's source library, device, tags, cues or OneLibrary as a side effect of testing. New destructive behavior must not be introduced without a clear explicit consent flow and rollback.

DJ Studio is independent of Rekordbox, AlphaTheta, Pioneer DJ and other DJ software vendors. Their marks remain with their owners.

## License

By contributing, you agree your code contribution can be distributed under the repository's MIT License. Ensure you have the right to contribute code and assets.
