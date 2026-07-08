#!/usr/bin/env python3
"""Build ICML 2026 workshop metadata from the official virtual site page."""

from __future__ import annotations

import json
import re
import urllib.request
from collections import Counter
from pathlib import Path

from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "workshops"
WORKSHOPS_PATH = OUTPUT_DIR / "workshops.json"
KEYWORDS_PATH = OUTPUT_DIR / "workshop_keywords.json"
SOURCE_URL = "https://icml.cc/virtual/2026/events/workshop"

STOPWORDS = {
    "about",
    "across",
    "advances",
    "and",
    "are",
    "around",
    "based",
    "between",
    "both",
    "bring",
    "can",
    "challenge",
    "challenges",
    "community",
    "data",
    "develop",
    "different",
    "from",
    "focus",
    "forum",
    "has",
    "have",
    "how",
    "icml",
    "invited",
    "into",
    "its",
    "learning",
    "machine",
    "method",
    "methods",
    "model",
    "models",
    "more",
    "new",
    "not",
    "our",
    "paper",
    "papers",
    "provide",
    "research",
    "researchers",
    "systems",
    "than",
    "that",
    "the",
    "their",
    "these",
    "this",
    "through",
    "together",
    "towards",
    "using",
    "via",
    "was",
    "we",
    "where",
    "which",
    "while",
    "with",
    "work",
    "workshop",
    "workshops",
    "talk",
    "talks",
}

DOMAIN_PHRASES = [
    "agentic ai",
    "ai agents",
    "ai for good",
    "ai for science",
    "audio",
    "causal inference",
    "coding agents",
    "computer vision",
    "cultural ai",
    "deep learning",
    "foundation models",
    "game theory",
    "generative ai",
    "governance",
    "human ai",
    "large language models",
    "life sciences",
    "machine learning for audio",
    "mechanistic interpretability",
    "multimodal",
    "optimization",
    "physics",
    "planning",
    "pluralistic alignment",
    "privacy",
    "reinforcement learning",
    "responsible ai",
    "robotics",
    "safety",
    "structured data",
    "trustworthy ai",
]


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def fetch_html() -> str:
    request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read().decode("utf-8", "ignore")


def parse_meta(meta_text: str) -> tuple[str, str, str]:
    match = re.match(r"(.+?),\s+(.+?M)\s+(.+)$", meta_text)
    if not match:
        return "", "", meta_text
    return clean_text(match.group(1)), clean_text(match.group(2)), clean_text(match.group(3))


def extract_workshops(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    workshops = []

    for card in soup.select(".event-card"):
        title_node = card.select_one(".event-title")
        title_link = title_node.find("a") if title_node else None
        title = clean_text(title_node.get_text(" ", strip=True)) if title_node else ""
        href = title_link.get("href", "") if title_link else ""
        speakers = clean_text(card.select_one(".event-speakers").get_text(" ", strip=True))
        organizers = [item.strip() for item in speakers.split("⋅") if item.strip()]
        meta = clean_text(card.select_one(".event-meta-row").get_text(" ", strip=True))
        date, time, room = parse_meta(meta)
        abstract_node = card.select_one(".event-abstract")
        for link in abstract_node.select("a") if abstract_node else []:
            link.decompose()
        abstract = clean_text(abstract_node.get_text(" ", strip=True)) if abstract_node else ""
        workshop_id = str(card.get("data-event-id") or "")

        workshops.append(
            {
                "id": workshop_id,
                "title": title,
                "organizers": organizers,
                "date": date,
                "time": time,
                "room": room,
                "abstract": abstract,
                "event_type": clean_text(card.get("data-event-type") or "Workshop"),
                "icml_url": f"https://icml.cc{href}" if href.startswith("/") else href,
                "source_url": SOURCE_URL,
            }
        )

    return workshops


def workshop_keywords(workshops: list[dict]) -> list[dict]:
    counts: Counter[str] = Counter()
    for workshop in workshops:
        text = normalize(f"{workshop['title']} {workshop['abstract']}")
        seen = set()
        for phrase in DOMAIN_PHRASES:
            if re.search(rf"\b{re.escape(phrase)}s?\b", text):
                seen.add(phrase)

        words = [word for word in text.split() if len(word) > 2 and word not in STOPWORDS]
        for size in (3, 2):
            for idx in range(len(words) - size + 1):
                phrase = " ".join(words[idx : idx + size])
                if any(part in STOPWORDS for part in phrase.split()):
                    continue
                if len(set(phrase.split())) != len(phrase.split()):
                    continue
                seen.add(phrase)

        counts.update(seen)

    ranked = []
    for phrase, count in counts.items():
        if count < 2:
            continue
        parts = phrase.split()
        domain_bonus = 2 if phrase in DOMAIN_PHRASES else 1
        multiword_bonus = 1.4 if len(parts) > 1 else 1
        score = count * domain_bonus * multiword_bonus
        ranked.append((score, count, phrase))

    ranked.sort(key=lambda item: (-item[0], -item[1], item[2]))
    return [{"keyword": phrase, "count": count} for _, count, phrase in ranked[:30]]


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    workshops = extract_workshops(fetch_html())
    WORKSHOPS_PATH.write_text(json.dumps(workshops, indent=2, ensure_ascii=False) + "\n")
    KEYWORDS_PATH.write_text(
        json.dumps(workshop_keywords(workshops), indent=2, ensure_ascii=False) + "\n"
    )
    print(f"Wrote {len(workshops)} workshops to {WORKSHOPS_PATH}")


if __name__ == "__main__":
    main()
