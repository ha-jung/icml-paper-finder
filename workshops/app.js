const DATA_PATH = "./workshops.json";
const KEYWORDS_PATH = "./workshop_keywords.json";
const STORAGE_KEY = "icml2026_saved_workshops";

const form = document.querySelector("#search-form");
const queryInput = document.querySelector("#query");
const roomFilter = document.querySelector("#room-filter");
const sortSelect = document.querySelector("#sort-select");
const showAllButton = document.querySelector("#show-all-button");
const savedButton = document.querySelector("#saved-button");
const statusEl = document.querySelector("#status");
const answerEl = document.querySelector("#answer");
const resultsEl = document.querySelector("#results");
const hotKeywordsList = document.querySelector("#hot-keywords-list");
const quickButtons = document.querySelectorAll("[data-query]");

let workshops = [];
let hotKeywords = [];
let savedIds = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
let activeQuery = "";
let activeExactSearch = false;
let activeView = "all";

const stopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "at",
  "by",
  "for",
  "from",
  "in",
  "is",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

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

function containsTerm(text, term) {
  const normalizedText = normalize(text);
  const normalizedTerm = normalize(term);
  if (!normalizedTerm) return false;
  const pattern = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^| )${pattern}( |$)`).test(normalizedText);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

function saveWorkshops() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...savedIds]));
}

function workshopText(workshop) {
  return normalize(
    [
      workshop.title,
      workshop.organizers.join(" "),
      workshop.date,
      workshop.time,
      workshop.room,
      workshop.abstract,
    ].join(" "),
  );
}

function queryMatches(workshop, query, exact = false) {
  const cleanQuery = query.trim();
  if (!cleanQuery) return true;

  const text = workshopText(workshop);
  const orGroups = cleanQuery.split(/\s+OR\s+/i);

  return orGroups.some((group) => {
    const andParts = group.split(/\s+AND\s+/i);
    return andParts.every((part) => {
      const tokens = tokenize(part);
      if (!tokens.length) return false;
      return exact
        ? tokens.every((token) => containsTerm(text, token))
        : tokens.every((token) => text.includes(token));
    });
  });
}

function scoreWorkshop(workshop, query, exact = false) {
  const title = normalize(workshop.title);
  const organizers = normalize(workshop.organizers.join(" "));
  const room = normalize(workshop.room);
  const abstract = normalize(workshop.abstract);
  const phrase = normalize(query);
  const hasPhrase = (text, value) => (exact ? containsTerm(text, value) : text.includes(value));
  let score = 0;

  if (phrase && hasPhrase(title, phrase)) score += 20;
  if (phrase && hasPhrase(abstract, phrase)) score += 8;
  if (phrase && hasPhrase(room, phrase)) score += 4;

  for (const token of tokenize(query)) {
    if (hasPhrase(title, token)) score += 8;
    if (hasPhrase(organizers, token)) score += 5;
    if (hasPhrase(abstract, token)) score += 3;
    if (hasPhrase(room, token)) score += 2;
  }

  return score;
}

function applyFilters(list) {
  return list.filter((workshop) => {
    if (roomFilter.value && workshop.room !== roomFilter.value) return false;
    return true;
  });
}

function sortWorkshops(list, mode = sortSelect.value) {
  return [...list].sort((a, b) => {
    if (mode === "relevance" && (b.score || a.score)) {
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    }
    if (mode === "room") {
      const roomOrder = a.room.localeCompare(b.room);
      if (roomOrder !== 0) return roomOrder;
    }
    return a.title.localeCompare(b.title);
  });
}

function search(query, exact = false) {
  return sortWorkshops(
    applyFilters(
      workshops
        .map((workshop) => ({ ...workshop, score: scoreWorkshop(workshop, query, exact) }))
        .filter((workshop) => queryMatches(workshop, query, exact)),
    ),
  );
}

function filteredWorkshops() {
  return sortWorkshops(applyFilters(workshops));
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

function snippet(value, query, maxLength = 340) {
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

function populateControls() {
  const rooms = [...new Set(workshops.map((workshop) => workshop.room).filter(Boolean))].sort();
  roomFilter.innerHTML = `<option value="">All rooms</option>${rooms
    .map((room) => `<option value="${escapeHtml(room)}">${escapeHtml(room)}</option>`)
    .join("")}`;
}

function populateHotKeywords() {
  hotKeywordsList.innerHTML = hotKeywords
    .slice(0, 10)
    .map(
      ({ keyword, count }) => `
        <button type="button" data-hot-keyword="${escapeHtml(keyword)}">
          <span>${escapeHtml(keyword)}</span>
          <small>${count}</small>
        </button>
      `,
    )
    .join("");
}

function renderWorkshops(matches, query = "") {
  resultsEl.innerHTML = matches
    .map((workshop) => {
      const saved = savedIds.has(workshop.id);
      const title = query ? highlight(workshop.title, query) : escapeHtml(workshop.title);
      const organizers = query
        ? highlight(workshop.organizers.join(", "), query)
        : escapeHtml(workshop.organizers.join(", "));
      const abstract = snippet(workshop.abstract, query);
      const abstractHtml = query ? highlight(abstract, query) : escapeHtml(abstract);
      const fullAbstract = query ? highlight(workshop.abstract, query) : escapeHtml(workshop.abstract);

      return `
        <article class="workshop-card">
          <div class="workshop-header">
            <h2 class="workshop-title">${title}</h2>
            <button class="save-button ${saved ? "saved" : ""}" type="button" data-save-id="${escapeHtml(workshop.id)}">
              ${saved ? "Saved" : "Save"}
            </button>
          </div>
          <div class="organizers">${organizers}</div>
          <div class="meta">
            ${workshop.date ? `<span class="pill">${escapeHtml(workshop.date)}</span>` : ""}
            ${workshop.time ? `<span class="pill">${escapeHtml(workshop.time)}</span>` : ""}
            ${workshop.room ? `<span class="pill">${escapeHtml(workshop.room)}</span>` : ""}
          </div>
          ${abstract ? `<p class="abstract">${abstractHtml}</p>` : ""}
          ${
            workshop.abstract
              ? `<details class="abstract-details"><summary>Full description</summary><p>${fullAbstract}</p></details>`
              : ""
          }
          <div class="links">
            ${workshop.icml_url ? `<a class="link-button" href="${escapeHtml(workshop.icml_url)}" target="_blank" rel="noopener">ICML details</a>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderAll() {
  activeView = "all";
  activeQuery = "";
  activeExactSearch = false;
  queryInput.value = "";
  const matches = filteredWorkshops();
  answerEl.innerHTML = `<strong>${matches.length} workshops found.</strong>`;
  renderWorkshops(matches);
}

function runSearch(query, options = {}) {
  const cleanQuery = query.trim();
  const exact = Boolean(options.exact);
  activeView = "search";
  activeQuery = cleanQuery;
  activeExactSearch = exact;

  if (!cleanQuery) {
    renderAll();
    return;
  }

  const matches = search(cleanQuery, exact);
  if (!matches.length) {
    answerEl.textContent = `No workshops found for "${cleanQuery}". Try broader keywords.`;
    resultsEl.innerHTML = "";
    return;
  }

  answerEl.innerHTML = `<strong>${matches.length} related workshops found.</strong>`;
  renderWorkshops(matches, cleanQuery);
}

function renderSaved() {
  activeView = "saved";
  const saved = sortWorkshops(workshops.filter((workshop) => savedIds.has(workshop.id)), "title");

  if (!saved.length) {
    answerEl.innerHTML = "<strong>Saved Workshops is empty.</strong>";
    resultsEl.innerHTML = "";
    return;
  }

  answerEl.innerHTML = `<strong>${saved.length} saved workshops.</strong>`;
  renderWorkshops(saved, activeQuery);
}

function rerender() {
  if (activeView === "saved") {
    renderSaved();
  } else if (activeQuery) {
    runSearch(activeQuery, { exact: activeExactSearch });
  } else {
    renderAll();
  }
}

async function boot() {
  try {
    const [workshopsResponse, keywordsResponse] = await Promise.all([
      fetch(DATA_PATH),
      fetch(KEYWORDS_PATH),
    ]);
    if (!workshopsResponse.ok) throw new Error(`Data load failed: ${workshopsResponse.status}`);
    workshops = await workshopsResponse.json();
    if (keywordsResponse.ok) {
      hotKeywords = await keywordsResponse.json();
    }
    populateControls();
    populateHotKeywords();
    statusEl.textContent = `${workshops.length} workshops loaded`;
    renderAll();
  } catch (error) {
    statusEl.textContent = "Could not load workshop data.";
    answerEl.textContent = error.message;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch(queryInput.value, { exact: false });
});

quickButtons.forEach((button) => {
  button.addEventListener("click", () => {
    queryInput.value = button.dataset.query;
    runSearch(button.dataset.query, { exact: false });
  });
});

hotKeywordsList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-hot-keyword]");
  if (!button) return;
  queryInput.value = button.dataset.hotKeyword;
  runSearch(button.dataset.hotKeyword, { exact: true });
});

[roomFilter, sortSelect].forEach((control) => {
  control.addEventListener("change", rerender);
});

showAllButton.addEventListener("click", renderAll);
savedButton.addEventListener("click", renderSaved);

resultsEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-save-id]");
  if (!button) return;

  const id = button.dataset.saveId;
  if (savedIds.has(id)) {
    savedIds.delete(id);
  } else {
    savedIds.add(id);
  }
  saveWorkshops();
  rerender();
});

boot();
