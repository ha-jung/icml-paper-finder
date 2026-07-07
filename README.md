# ICML 2026 Paper Finder

Static web app for searching ICML 2026 papers by title, authors, abstracts, topics, sessions, and keywords.

Built by Claude Code.

The metadata is built from the official ICML 2026 virtual site JSON files:

- `https://icml.cc/static/virtual/data/icml-2026-orals-posters.json`
- `https://icml.cc/static/virtual/data/icml-2026-abstracts.json`

## Rebuild Data

```bash
python3 build_papers.py
```

This regenerates `papers.json`.

