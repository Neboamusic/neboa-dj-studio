## What does this change?

Describe the problem solved and its impact on DJs. Link the related issue where relevant.

## Tests

- [ ] `node --test tests/*.test.js`
- [ ] `python3 -m unittest discover -s tests -p test_safety_v041.py -v`
- [ ] `python3 -m unittest discover -s tests -p test_normalizer.py -v` (if FFmpeg functionality changed)

## Safety and privacy

- [ ] No licensed audio, original USB data, private paths or secrets added
- [ ] No writes to Rekordbox databases, metadata or original tracks
- [ ] Consent for creating new audio copies remains explicit
- [ ] Documentation and accessibility reviewed if UI changes
