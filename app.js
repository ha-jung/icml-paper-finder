const DATA_PATH = "./papers.json";
const SEMANTIC_KEYWORDS_PATH = "./semantic_keywords.json";
const MAX_RESULTS = 60;
const STORAGE_KEY = "icml2026_saved_papers";
const SEOUL_TIME_ZONE = "Asia/Seoul";

const form = document.querySelector("#search-form");
const timeForm = document.querySelector("#time-form");
const queryInput = document.querySelector("#query");
const dateSelect = document.querySelector("#date-select");
const timeSelect = document.querySelector("#time-select");
const typeFilter = document.querySelector("#type-filter");
const decisionFilter = document.querySelector("#decision-filter");
const topicFilter = document.querySelector("#topic-filter");
const sessionFilter = document.querySelector("#session-filter");
const sortSelect = document.querySelector("#sort-select");
const scheduleButton = document.querySelector("#schedule-button");
const clearButton = document.querySelector("#clear-button");
const statusEl = document.querySelector("#status");
const answerEl = document.querySelector("#answer");
const resultsEl = document.querySelector("#results");
const hotKeywordsList = document.querySelector("#hot-keywords-list");
const quickButtons = document.querySelectorAll("[data-query]");

let papers = [];
let semanticKeywords = {};
let savedIds = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
let activeView = "home";
let activeQuery = "";

const stopWords = new Set([
  "a",
  "an",
  "and",
  "approach",
  "are",
  "based",
  "at",
  "by",
  "data",
  "dataset",
  "datasets",
  "deep",
  "different",
  "for",
  "from",
  "framework",
  "in",
  "is",
  "learning",
  "method",
  "methods",
  "model",
  "models",
  "new",
  "of",
  "on",
  "or",
  "paper",
  "papers",
  "performance",
  "show",
  "task",
  "tasks",
  "the",
  "to",
  "training",
  "using",
  "with",
]);

const hotKeywordStopWords = new Set([
  ...stopWords,
  "algorithm",
  "analysis",
  "applications",
  "aspects",
  "autoencoders",
  "aware",
  "benchmark",
  "can",
  "computer",
  "efficient",
  "existing",
  "else",
  "everything",
  "generation",
  "generative",
  "general",
  "high",
  "however",
  "improve",
  "language",
  "large",
  "machine",
  "multi",
  "neural",
  "novel",
  "often",
  "propose",
  "proposed",
  "remains",
  "representation",
  "reinforcement",
  "results",
  "social",
  "state",
  "such",
  "these",
  "theory",
  "their",
  "this",
  "time",
  "via",
  "where",
  "which",
  "while",
  "work",
  "yet",
]);

const hotPhrases = [
  "large language model",
  "language model",
  "reinforcement learning",
  "diffusion model",
  "diffusion models",
  "graph neural network",
  "graph neural networks",
  "computer vision",
  "foundation model",
  "foundation models",
  "representation learning",
  "federated learning",
  "time series",
  "optimal transport",
  "causal inference",
  "generative model",
  "generative models",
  "in context learning",
  "multi agent",
  "vision language",
  "offline reinforcement learning",
  "single cell",
];

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: SEOUL_TIME_ZONE,
    timeZoneName: "short",
  }).format(date);
}

function formatTimeRange(paper) {
  if (!paper.starttime || !paper.endtime) return "";
  const start = new Date(paper.starttime);
  const end = new Date(paper.endtime);
  const startText = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: SEOUL_TIME_ZONE,
  }).format(start);
  const endText = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: SEOUL_TIME_ZONE,
    timeZoneName: "short",
  }).format(end);
  return `${startText}-${endText}`;
}

function seoulParts(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: SEOUL_TIME_ZONE,
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function seoulDateKey(value) {
  const parts = seoulParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function seoulTimeKey(value) {
  const parts = seoulParts(value);
  return `${parts.hour}:${parts.minute}`;
}

function timeToMinutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function formatDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatTimeKey(timeKey) {
  const [hour, minute] = timeKey.split(":").map(Number);
  const date = new Date(Date.UTC(2026, 0, 1, hour, minute));
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function paperText(paper) {
  return normalize(
    [
      paper.title,
      paper.authors.join(" "),
      paper.institutions.join(" "),
      paper.topic,
      paper.keywords.join(" "),
      paper.decision,
      paper.event_type,
      paper.session,
      paper.room,
      paper.poster_position,
      paper.abstract,
    ].join(" "),
  );
}

function queryMatches(paper, query) {
  const cleanQuery = query.trim();
  if (!cleanQuery) return true;

  const text = paperText(paper);
  const orGroups = cleanQuery.split(/\s+OR\s+/i);

  return orGroups.some((group) => {
    const andParts = group.split(/\s+AND\s+/i);
    return andParts.every((part) => {
      const tokens = tokenize(part);
      return tokens.length > 0 && tokens.every((token) => text.includes(token));
    });
  });
}

function scorePaper(paper, query) {
  const title = normalize(paper.title);
  const authors = normalize(paper.authors.join(" "));
  const topic = normalize(paper.topic);
  const keywords = normalize(paper.keywords.join(" "));
  const abstract = normalize(paper.abstract);
  const phrase = normalize(query);
  let score = 0;

  if (phrase && title.includes(phrase)) score += 22;
  if (phrase && topic.includes(phrase)) score += 14;
  if (phrase && keywords.includes(phrase)) score += 12;
  if (phrase && abstract.includes(phrase)) score += 6;

  for (const token of tokenize(query)) {
    if (title.includes(token)) score += 9;
    if (authors.includes(token)) score += 7;
    if (topic.includes(token)) score += 6;
    if (keywords.includes(token)) score += 5;
    if (abstract.includes(token)) score += 3;
  }

  return score;
}

function populateFilters() {
  const types = [...new Set(papers.map((paper) => paper.event_type).filter(Boolean))].sort();
  const decisions = [...new Set(papers.map(recognitionLabel).filter(Boolean))].sort();
  const topics = [...new Set(papers.map((paper) => paper.topic).filter(Boolean))].sort();
  const sessions = [...new Set(papers.map((paper) => paper.session).filter(Boolean))].sort();
  const scheduledPapers = papers.filter((paper) => paper.starttime && paper.endtime);
  const dates = [...new Set(scheduledPapers.map((paper) => seoulDateKey(paper.starttime)))].sort();
  const times = [
    ...new Set(
      scheduledPapers.flatMap((paper) => [seoulTimeKey(paper.starttime), seoulTimeKey(paper.endtime)]),
    ),
  ].sort();

  typeFilter.innerHTML = `<option value="">All presentations</option>${types
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join("")}`;
  decisionFilter.innerHTML = `<option value="">All recognition levels</option>${decisions
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join("")}`;
  topicFilter.innerHTML = `<option value="">All topics</option>${topics
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join("")}`;
  sessionFilter.innerHTML = `<option value="">All sessions</option>${sessions
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join("")}`;
  dateSelect.innerHTML = dates
    .map((value) => `<option value="${escapeHtml(value)}">${formatDateKey(value)}</option>`)
    .join("");
  timeSelect.innerHTML = times
    .map((value) => `<option value="${escapeHtml(value)}">${formatTimeKey(value)}</option>`)
    .join("");
}

function ngrams(tokens, size) {
  const grams = [];
  for (let i = 0; i <= tokens.length - size; i += 1) {
    grams.push(tokens.slice(i, i + size).join(" "));
  }
  return grams;
}

function hotKeywordCandidates(text) {
  const tokens = normalize(text)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !hotKeywordStopWords.has(token) && !/^\d+$/.test(token));
  return [...tokens, ...ngrams(tokens, 2), ...ngrams(tokens, 3)];
}

function papersForHotKeywords() {
  return papers.filter((paper) => {
    if (typeFilter.value && paper.event_type !== typeFilter.value) return false;
    if (decisionFilter.value && recognitionLabel(paper) !== decisionFilter.value) return false;
    if (topicFilter.value && paper.topic !== topicFilter.value) return false;
    if (sessionFilter.value && paper.session !== sessionFilter.value) return false;
    return true;
  });
}

function populateHotKeywords() {
  const semanticGroup = semanticKeywords[topicFilter.value || "__all__"];
  if (semanticGroup && semanticGroup.length) {
    hotKeywordsList.innerHTML = semanticGroup
      .slice(0, 24)
      .map(
        (item) =>
          `<button type="button" data-hot-keyword="${escapeHtml(item.keyword)}">${escapeHtml(item.keyword)} <span>${escapeHtml(String(item.count))}</span></button>`,
      )
      .join("");
    return;
  }

  const counts = new Map();
  const sourcePapers = papersForHotKeywords();
  for (const paper of sourcePapers) {
    const text = [paper.title, paper.topic].join(" ");
    const normalizedText = normalize(text);
    const seen = new Set(hotKeywordCandidates(text));
    for (const phrase of hotPhrases) {
      if (normalizedText.includes(phrase)) seen.add(phrase);
    }
    for (const keyword of seen) {
      counts.set(keyword, (counts.get(keyword) || 0) + 1);
    }
  }

  const hotKeywords = [...counts.entries()]
    .filter(([keyword, count]) => count >= 18 && keyword.length <= 36)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, 24);

  if (!hotKeywords.length) {
    hotKeywordsList.innerHTML = `<span class="empty-keywords">No keyword suggestions for this filter.</span>`;
    return;
  }

  hotKeywordsList.innerHTML = hotKeywords
    .map(
      ([keyword, count]) =>
        `<button type="button" data-hot-keyword="${escapeHtml(keyword)}">${escapeHtml(keyword)} <span>${count}</span></button>`,
    )
    .join("");
}

function applyFilters(list) {
  return list.filter((paper) => {
    if (typeFilter.value && paper.event_type !== typeFilter.value) return false;
    if (decisionFilter.value && recognitionLabel(paper) !== decisionFilter.value) return false;
    if (topicFilter.value && paper.topic !== topicFilter.value) return false;
    if (sessionFilter.value && paper.session !== sessionFilter.value) return false;
    return true;
  });
}

function sortPapers(list, mode = sortSelect.value) {
  return [...list].sort((a, b) => {
    if (mode === "relevance" && ((b.score || 0) !== (a.score || 0))) {
      return (b.score || 0) - (a.score || 0);
    }
    if (mode === "topic") {
      const topicOrder = a.topic.localeCompare(b.topic);
      if (topicOrder !== 0) return topicOrder;
    }
    if (mode === "title") return a.title.localeCompare(b.title);
    return `${a.starttime} ${a.title}`.localeCompare(`${b.starttime} ${b.title}`);
  });
}

function search(query) {
  return sortPapers(
    applyFilters(
      papers
        .map((paper) => ({ ...paper, score: scorePaper(paper, query) }))
        .filter((paper) => queryMatches(paper, query)),
    ),
  ).slice(0, MAX_RESULTS);
}

function papersAtTime(dateKey, timeKey, query = "") {
  const selected = timeToMinutes(timeKey);

  return sortPapers(
    applyFilters(
      papers
        .map((paper) => ({ ...paper, score: scorePaper(paper, query) }))
        .filter((paper) => {
          if (!paper.starttime || !paper.endtime) return false;
          if (seoulDateKey(paper.starttime) !== dateKey) return false;
          if (!queryMatches(paper, query)) return false;
          const start = timeToMinutes(seoulTimeKey(paper.starttime));
          const end = timeToMinutes(seoulTimeKey(paper.endtime));
          return start <= selected && selected < end;
        }),
    ),
    query ? sortSelect.value : "time",
  ).slice(0, MAX_RESULTS);
}

function highlight(value, query) {
  let html = escapeHtml(value);
  const tokens = [...new Set(tokenize(query))].sort((a, b) => b.length - a.length);

  for (const token of tokens) {
    const pattern = new RegExp(`(${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    html = html.replace(pattern, "<mark>$1</mark>");
  }

  return html;
}

function snippet(value, query, maxLength = 360) {
  const cleanValue = String(value || "").replace(/\s+/g, " ").trim();
  if (!cleanValue) return "";

  const normalized = normalize(cleanValue);
  const hit = tokenize(query)
    .map((token) => normalized.indexOf(token))
    .find((index) => index >= 0);
  const start = hit && hit > 90 ? Math.max(0, hit - 100) : 0;
  const end = Math.min(cleanValue.length, start + maxLength);
  return `${start > 0 ? "... " : ""}${cleanValue.slice(start, end)}${
    end < cleanValue.length ? " ..." : ""
  }`;
}

function savePapers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...savedIds]));
}

function recognitionLabel(paper) {
  if (paper.award) return paper.award;
  if (paper.event_type === "Oral") return "Oral";
  if ((paper.decision || "").toLowerCase().includes("spotlight")) return "Spotlight";
  if ((paper.decision || "").toLowerCase().includes("regular")) return "Regular";
  if ((paper.decision || "").toLowerCase().includes("poster")) return "Poster";
  return "";
}

function recognitionClass(label) {
  return normalize(label).replace(/\s+/g, "-");
}

function renderPapers(matches, query = "") {
  resultsEl.innerHTML = matches
    .map((paper) => {
      const saved = savedIds.has(paper.id);
      const recognition = recognitionLabel(paper);
      const title = query ? highlight(paper.title, query) : escapeHtml(paper.title);
      const authors = query
        ? highlight(paper.authors.join(", "), query)
        : escapeHtml(paper.authors.join(", "));
      const topic = query ? highlight(paper.topic, query) : escapeHtml(paper.topic);
      const keywords = paper.keywords.length
        ? query
          ? highlight(paper.keywords.join("; "), query)
          : escapeHtml(paper.keywords.join("; "))
        : "";
      const abstract = snippet(paper.abstract, query);
      const abstractHtml = query ? highlight(abstract, query) : escapeHtml(abstract);
      const fullAbstract = query ? highlight(paper.abstract, query) : escapeHtml(paper.abstract);

      return `
        <article class="paper-card">
          <div class="paper-header">
            <h2 class="paper-title">${title}</h2>
            <button class="save-button ${saved ? "saved" : ""}" type="button" data-save-id="${escapeHtml(paper.id)}">
              ${saved ? "Saved" : "Save"}
            </button>
          </div>
          <div class="meta">
            ${
              recognition
                ? `<span class="pill badge-${escapeHtml(recognitionClass(recognition))}">${escapeHtml(recognition)}</span>`
                : ""
            }
            ${paper.session ? `<span class="pill">${escapeHtml(paper.session)}</span>` : ""}
            ${paper.starttime ? `<span class="pill">${escapeHtml(formatTimeRange(paper))}</span>` : ""}
            ${paper.room ? `<span class="pill">${escapeHtml(paper.room)}</span>` : ""}
            ${paper.poster_position ? `<span class="pill">${escapeHtml(paper.poster_position)}</span>` : ""}
          </div>
          <div class="authors">${authors}</div>
          ${paper.topic ? `<div class="topic">${topic}</div>` : ""}
          ${keywords ? `<div class="keywords">${keywords}</div>` : ""}
          ${abstract ? `<p class="abstract">${abstractHtml}</p>` : ""}
          ${
            paper.abstract
              ? `<details class="abstract-details"><summary>Full abstract</summary><p>${fullAbstract}</p></details>`
              : ""
          }
          <div class="links">
            ${paper.icml_url ? `<a class="link-button" href="${escapeHtml(paper.icml_url)}" target="_blank" rel="noopener">ICML page</a>` : ""}
            ${paper.openreview_url ? `<a class="link-button" href="${escapeHtml(paper.openreview_url)}" target="_blank" rel="noopener">OpenReview</a>` : ""}
            ${paper.poster_url ? `<a class="link-button" href="${escapeHtml(paper.poster_url)}" target="_blank" rel="noopener">Poster</a>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

function runSearch(query) {
  const cleanQuery = query.trim();
  activeView = "search";
  activeQuery = cleanQuery;

  if (!cleanQuery) {
    answerEl.textContent = "Enter a keyword query to search titles, abstracts, authors, topics, and sessions.";
    resultsEl.innerHTML = "";
    return;
  }

  const matches = search(cleanQuery);
  if (!matches.length) {
    answerEl.textContent = `No papers found for "${cleanQuery}". Try fewer filters or broader keywords.`;
    resultsEl.innerHTML = "";
    return;
  }

  const top = matches[0];
  answerEl.innerHTML = `
    <strong>${matches.length} related papers found.</strong>
    The strongest match is <strong>${escapeHtml(top.title)}</strong>.
  `;
  renderPapers(matches, cleanQuery);
}

function runTimeSearch() {
  const cleanQuery = queryInput.value.trim();
  const matches = papersAtTime(dateSelect.value, timeSelect.value, cleanQuery);
  const label = `${formatDateKey(dateSelect.value)} at ${formatTimeKey(timeSelect.value)} KST`;
  const queryText = cleanQuery ? ` matching <strong>${escapeHtml(cleanQuery)}</strong>` : "";

  activeView = "time";
  activeQuery = cleanQuery;

  if (!matches.length) {
    answerEl.innerHTML = `<strong>No papers found</strong> for ${label}${queryText}. Try another time, keyword, or fewer filters.`;
    resultsEl.innerHTML = "";
    return;
  }

  answerEl.innerHTML = `<strong>${matches.length} papers are active</strong> on <strong>${label}</strong>${queryText}.`;
  renderPapers(matches, cleanQuery);
}

function renderSaved() {
  activeView = "saved";
  const saved = sortPapers(papers.filter((paper) => savedIds.has(paper.id)), "time");

  if (!saved.length) {
    answerEl.innerHTML = "<strong>No saved papers yet.</strong> Save papers to build a reading list.";
    resultsEl.innerHTML = "";
    return;
  }

  answerEl.innerHTML = `<strong>${saved.length} saved papers.</strong>`;
  renderPapers(saved, activeQuery);
}

function rerender() {
  if (activeView === "saved") {
    renderSaved();
  } else if (activeView === "time") {
    runTimeSearch();
  } else if (activeQuery) {
    runSearch(activeQuery);
  }
}

function clearFilters() {
  typeFilter.value = "";
  decisionFilter.value = "";
  topicFilter.value = "";
  sessionFilter.value = "";
  sortSelect.value = "relevance";
  rerender();
}

async function boot() {
  try {
    const [papersResponse, keywordsResponse] = await Promise.all([
      fetch(DATA_PATH),
      fetch(SEMANTIC_KEYWORDS_PATH),
    ]);
    if (!papersResponse.ok) throw new Error(`Data load failed: ${papersResponse.status}`);
    papers = await papersResponse.json();
    if (keywordsResponse.ok) {
      semanticKeywords = await keywordsResponse.json();
    }
    populateFilters();
    populateHotKeywords();
    const oralCount = papers.filter((paper) => paper.event_type === "Oral").length;
    const spotlightCount = papers.filter((paper) => paper.decision.includes("spotlight")).length;
    statusEl.textContent = `${papers.length} papers loaded · ${oralCount} oral · ${spotlightCount} spotlight`;
    answerEl.textContent = "Enter a keyword query to find ICML 2026 papers.";
  } catch (error) {
    statusEl.textContent = "Could not load ICML paper data.";
    answerEl.textContent = error.message;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch(queryInput.value);
});

timeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runTimeSearch();
});

quickButtons.forEach((button) => {
  button.addEventListener("click", () => {
    queryInput.value = button.dataset.query;
    runSearch(button.dataset.query);
  });
});

hotKeywordsList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-hot-keyword]");
  if (!button) return;
  queryInput.value = button.dataset.hotKeyword;
  runSearch(button.dataset.hotKeyword);
});

[typeFilter, decisionFilter, topicFilter, sessionFilter, sortSelect].forEach((control) => {
  control.addEventListener("change", () => {
    populateHotKeywords();
    rerender();
  });
});

scheduleButton.addEventListener("click", renderSaved);
clearButton.addEventListener("click", clearFilters);

resultsEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-save-id]");
  if (!button) return;

  const id = button.dataset.saveId;
  if (savedIds.has(id)) {
    savedIds.delete(id);
  } else {
    savedIds.add(id);
  }
  savePapers();
  rerender();
});

boot();
