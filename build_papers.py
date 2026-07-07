#!/usr/bin/env python3
"""Build ICML 2026 paper metadata from the official ICML virtual site JSON."""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
EVENTS_PATH = DATA_DIR / "icml-2026-orals-posters.json"
ABSTRACTS_PATH = DATA_DIR / "icml-2026-abstracts.json"
OUTPUT_PATH = ROOT / "papers.json"

EVENTS_URL = "https://icml.cc/static/virtual/data/icml-2026-orals-posters.json"
ABSTRACTS_URL = "https://icml.cc/static/virtual/data/icml-2026-abstracts.json"


def fetch(url: str, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as response:
        path.write_bytes(response.read())


def names(items: list[dict], key: str) -> list[str]:
    return [str(item.get(key, "")).strip() for item in items if str(item.get(key, "")).strip()]


def main() -> None:
    fetch(EVENTS_URL, EVENTS_PATH)
    fetch(ABSTRACTS_URL, ABSTRACTS_PATH)

    events = json.loads(EVENTS_PATH.read_text(encoding="utf-8"))["results"]
    abstracts = json.loads(ABSTRACTS_PATH.read_text(encoding="utf-8"))

    papers = []
    for event in events:
        paper_id = str(event.get("id", "")).strip()
        authors = event.get("authors") or []
        keywords = event.get("keywords") or []
        media = event.get("eventmedia") or []
        poster_media = next(
            (
                item
                for item in media
                if item.get("type") == "Poster" and item.get("visible") and item.get("file")
            ),
            None,
        )

        papers.append(
            {
                "id": paper_id,
                "title": str(event.get("name") or "").strip(),
                "authors": names(authors, "fullname"),
                "institutions": sorted(set(names(authors, "institution"))),
                "topic": str(event.get("topic") or "").strip(),
                "keywords": [str(keyword).strip() for keyword in keywords if str(keyword).strip()],
                "decision": str(event.get("decision") or "").strip(),
                "event_type": str(event.get("event_type") or event.get("eventtype") or "").strip(),
                "session": str(event.get("session") or "").strip(),
                "room": str(event.get("room_name") or "").strip(),
                "poster_position": str(event.get("poster_position") or "").strip(),
                "starttime": str(event.get("starttime") or "").strip(),
                "endtime": str(event.get("endtime") or "").strip(),
                "abstract": str(abstracts.get(paper_id) or "").strip(),
                "openreview_url": str(event.get("paper_url") or "").strip(),
                "pdf_url": str(event.get("paper_pdf_url") or "").strip(),
                "icml_url": f"https://icml.cc{event.get('virtualsite_url')}"
                if event.get("virtualsite_url")
                else "",
                "poster_url": f"https://icml.cc{poster_media.get('file')}"
                if poster_media
                else "",
            }
        )

    OUTPUT_PATH.write_text(json.dumps(papers, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(papers)} papers to {OUTPUT_PATH}")
    print(f"With abstracts: {sum(1 for paper in papers if paper['abstract'])}")


if __name__ == "__main__":
    main()
