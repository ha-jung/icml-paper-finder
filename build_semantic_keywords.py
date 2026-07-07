#!/usr/bin/env python3
"""Build topic-aware keyword suggestions from ICML titles and abstracts.

This intentionally avoids heavyweight model dependencies. It extracts candidate
technical phrases, then ranks them by topic specificity and within-topic
coverage. The output is consumed by the browser as `semantic_keywords.json`.
"""

from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent
PAPERS_PATH = ROOT / "papers.json"
OUTPUT_PATH = ROOT / "semantic_keywords.json"

TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z\-]{2,}")

STOP_WORDS = {
    "able",
    "about",
    "above",
    "across",
    "additional",
    "after",
    "against",
    "algorithm",
    "algorithms",
    "also",
    "and",
    "although",
    "among",
    "analysis",
    "approach",
    "approaches",
    "application",
    "applications",
    "are",
    "around",
    "based",
    "baseline",
    "baselines",
    "because",
    "been",
    "being",
    "benchmark",
    "benchmarks",
    "better",
    "between",
    "both",
    "can",
    "cannot",
    "capabilities",
    "compared",
    "comprehensive",
    "computer",
    "demonstrate",
    "demonstrates",
    "different",
    "does",
    "due",
    "during",
    "each",
    "deep",
    "effective",
    "effectively",
    "efficient",
    "empirical",
    "enables",
    "enabling",
    "especially",
    "evaluate",
    "evaluated",
    "evaluation",
    "existing",
    "experiment",
    "experimental",
    "experiments",
    "extensive",
    "first",
    "for",
    "from",
    "further",
    "general",
    "high",
    "however",
    "important",
    "improve",
    "improved",
    "improves",
    "including",
    "introduce",
    "introduces",
    "large",
    "language",
    "leading",
    "learn",
    "leveraging",
    "llms",
    "many",
    "method",
    "methods",
    "model",
    "models",
    "more",
    "most",
    "need",
    "new",
    "novel",
    "often",
    "only",
    "paper",
    "particular",
    "performance",
    "perform",
    "present",
    "presents",
    "previous",
    "problem",
    "problems",
    "propose",
    "proposed",
    "provide",
    "provides",
    "recent",
    "recently",
    "remains",
    "result",
    "results",
    "several",
    "show",
    "showing",
    "shown",
    "shows",
    "significant",
    "significantly",
    "specific",
    "specifically",
    "state",
    "study",
    "such",
    "than",
    "that",
    "the",
    "their",
    "them",
    "these",
    "this",
    "through",
    "towards",
    "under",
    "using",
    "various",
    "very",
    "via",
    "where",
    "which",
    "while",
    "with",
    "within",
    "without",
    "work",
    "works",
}

DOMAIN_SINGLETONS = {
    "alignment",
    "attention",
    "compression",
    "diffusion",
    "forecasting",
    "graphs",
    "interpretability",
    "optimization",
    "privacy",
    "quantization",
    "reasoning",
    "retrieval",
    "robotics",
    "safety",
    "segmentation",
    "transformers",
}

HEAD_WORDS = {
    "adaptation",
    "alignment",
    "attack",
    "attacks",
    "classification",
    "compression",
    "control",
    "detection",
    "distillation",
    "editing",
    "estimation",
    "forecasting",
    "generation",
    "inference",
    "learning",
    "modeling",
    "optimization",
    "planning",
    "prediction",
    "pretraining",
    "reasoning",
    "recognition",
    "reconstruction",
    "retrieval",
    "sampling",
    "segmentation",
    "selection",
    "synthesis",
    "transfer",
}

CANONICAL_PHRASES = {
    "large language model",
    "large language models",
    "language model",
    "language models",
    "reinforcement learning",
    "offline reinforcement learning",
    "graph neural network",
    "graph neural networks",
    "computer vision",
    "foundation model",
    "foundation models",
    "diffusion model",
    "diffusion models",
    "representation learning",
    "federated learning",
    "time series",
    "time series forecasting",
    "optimal transport",
    "causal inference",
    "generative model",
    "generative models",
    "in context learning",
    "vision language",
    "single cell",
    "object detection",
    "image segmentation",
    "semantic segmentation",
    "domain adaptation",
    "domain generalization",
    "multi agent",
    "retrieval augmented generation",
    "text to sql",
    "protein structure prediction",
    "molecular generation",
    "molecular property prediction",
}

GENERIC_PHRASES = {
    "deep learning",
    "machine learning",
    "neural network",
    "neural networks",
}


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip().lower()


def tokens(value: str) -> list[str]:
    return [token.lower().replace("-", " ") for token in TOKEN_RE.findall(value or "")]


def ngrams(items: list[str], size: int) -> list[str]:
    return [" ".join(items[idx : idx + size]) for idx in range(len(items) - size + 1)]


def useful_phrase(phrase: str) -> bool:
    phrase = phrase.strip()
    parts = phrase.split()
    if not parts or len(phrase) < 5 or len(phrase) > 52:
        return False
    if phrase in CANONICAL_PHRASES:
        return True
    if phrase in GENERIC_PHRASES:
        return False
    if len(parts) != len(set(parts)):
        return False
    if any(part in STOP_WORDS for part in [parts[0], parts[-1]]):
        return False
    if len(parts) == 1:
        return parts[0] in DOMAIN_SINGLETONS
    if any(part in STOP_WORDS for part in parts):
        return False
    if parts[-1] in HEAD_WORDS:
        return True
    if len(parts) >= 2 and any(part in DOMAIN_SINGLETONS for part in parts):
        return True
    return False


def phrase_candidates(paper: dict) -> set[str]:
    title = normalize_text(paper.get("title", ""))
    topic = normalize_text(paper.get("topic", "").replace("->", " "))
    abstract = normalize_text(paper.get("abstract", ""))[:1200]

    candidates: set[str] = set()
    for source in [title, topic, f"{title} {topic}", abstract]:
        source_tokens = [token for token in tokens(source) if token not in STOP_WORDS]
        for size in [1, 2, 3, 4]:
            candidates.update(phrase for phrase in ngrams(source_tokens, size) if useful_phrase(phrase))

    combined = f"{title} {topic} {abstract}"
    for phrase in CANONICAL_PHRASES:
        if phrase in combined:
            candidates.add(phrase)

    return candidates


def score_phrase(topic_count: int, global_count: int, topic_size: int, total_docs: int, phrase: str) -> float:
    coverage = topic_count / max(topic_size, 1)
    specificity = math.log((total_docs + 10) / (global_count + 5))
    multiword_bonus = 1.35 if " " in phrase else 1.0
    canonical_bonus = 1.25 if phrase in CANONICAL_PHRASES else 1.0
    return coverage * specificity * math.log1p(topic_count) * multiword_bonus * canonical_bonus


def build_group(
    indices: list[int],
    paper_candidates: list[set[str]],
    global_counts: Counter[str],
    total_docs: int,
) -> list[dict]:
    topic_counts: Counter[str] = Counter()
    for idx in indices:
        topic_counts.update(paper_candidates[idx])

    topic_size = len(indices)
    min_count = max(3, min(18, math.ceil(topic_size * 0.02)))
    ranked = []
    for phrase, count in topic_counts.items():
        if count < min_count:
            continue
        ranked.append(
            {
                "keyword": phrase,
                "count": count,
                "score": round(score_phrase(count, global_counts[phrase], topic_size, total_docs, phrase), 5),
            }
        )

    ranked.sort(key=lambda item: (-item["score"], -item["count"], item["keyword"]))
    selected = []
    seen_roots: Counter[str] = Counter()
    for item in ranked:
        root = item["keyword"].split()[-1]
        if seen_roots[root] >= 3:
            continue
        seen_roots[root] += 1
        selected.append(item)
        if len(selected) >= 30:
            break
    return selected


def main() -> None:
    papers = json.loads(PAPERS_PATH.read_text(encoding="utf-8"))
    paper_candidates = [phrase_candidates(paper) for paper in papers]

    global_counts: Counter[str] = Counter()
    for candidates in paper_candidates:
        global_counts.update(candidates)

    topics = sorted({paper.get("topic", "") for paper in papers if paper.get("topic")})
    topic_to_indices = {
        topic: [idx for idx, paper in enumerate(papers) if paper.get("topic") == topic]
        for topic in topics
    }
    topic_to_indices["__all__"] = list(range(len(papers)))

    output = {}
    for topic, indices in topic_to_indices.items():
        if len(indices) < 8:
            continue
        output[topic] = build_group(indices, paper_candidates, global_counts, len(papers))

    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(output)} keyword groups to {OUTPUT_PATH}")
    print("Overall examples:")
    for item in output.get("__all__", [])[:20]:
        print(f"  {item['keyword']} ({item['count']})")


if __name__ == "__main__":
    main()
