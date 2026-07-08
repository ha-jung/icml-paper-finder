# ICML 2026 Paper Finder

Static web app for searching ICML 2026 papers by title, authors, abstracts, topics, sessions, and keywords.

Built by Claude Code.

The companion workshop finder is available at `./workshops/`.

The metadata is built from the official ICML 2026 virtual site JSON files:

- `https://icml.cc/static/virtual/data/icml-2026-orals-posters.json`
- `https://icml.cc/static/virtual/data/icml-2026-abstracts.json`

## Rebuild Data

```bash
python3 build_papers.py
```

This regenerates `papers.json`.

To rebuild the workshop finder data:

```bash
python3 build_workshops.py
```

This regenerates `workshops/workshops.json` and `workshops/workshop_keywords.json` from the official ICML workshop events page.
