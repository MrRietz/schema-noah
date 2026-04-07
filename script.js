const LIVE_CSV_URL = "https://docs.google.com/spreadsheets/d/1Veinh7xcEHV_R2tvMd-3oIUt3_EqWYrQTWi211fpL-c/export?format=csv&gid=0";
const FALLBACK_DATA_URL = "./data/calendar.json";
const SWEDISH_DATE = new Intl.DateTimeFormat("sv-SE", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const RANGE_DATE = new Intl.DateTimeFormat("sv-SE", {
  day: "numeric",
  month: "long",
});

const els = {
  prevWeek: document.querySelector("#prev-week"),
  nextWeek: document.querySelector("#next-week"),
  todayWeek: document.querySelector("#today-week"),
  weekLabel: document.querySelector("#week-label"),
  weekRange: document.querySelector("#week-range"),
  weekGrid: document.querySelector("#week-grid"),
  status: document.querySelector("#status"),
  template: document.querySelector("#day-card-template"),
};

let weeks = [];
let currentWeekIndex = 0;

init().catch((error) => {
  setStatus("Kunde inte läsa kalenderdatan.");
  console.error(error);
});

async function init() {
  setStatus("Läser kalenderdata...");

  const rawEntries = await loadEntries();
  const entries = rawEntries
    .map((entry) => ({
      ...entry,
      dateObject: new Date(`${entry.datum}T00:00:00`),
      weekKey: `${entry.ar}-v${String(entry.vecka).padStart(2, "0")}`,
    }))
    .sort((left, right) => left.datum.localeCompare(right.datum));

  weeks = groupWeeks(entries);
  currentWeekIndex = findInitialWeekIndex(weeks);

  bindEvents();
  render();
}

async function loadEntries() {
  try {
    const csvText = await fetchLiveCsv();
    const entries = parseCsv(csvText);
    setStatus("Visar live-data från Google Sheets.");
    return entries;
  } catch (error) {
    console.warn("Live-hämtning misslyckades, använder lokal kopia.", error);
  }

  const response = await fetch(FALLBACK_DATA_URL);
  if (!response.ok) {
    throw new Error(`Kunde inte hämta reservdata (${response.status})`);
  }

  setStatus("Visar lokal kopia av kalendern.");
  return response.json();
}

async function fetchLiveCsv() {
  const response = await fetch(LIVE_CSV_URL, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Live-data svarade med ${response.status}`);
  }

  return response.text();
}

function bindEvents() {
  els.prevWeek.addEventListener("click", () => {
    currentWeekIndex -= 1;
    render();
  });

  els.nextWeek.addEventListener("click", () => {
    currentWeekIndex += 1;
    render();
  });

  els.todayWeek.addEventListener("click", () => {
    currentWeekIndex = findInitialWeekIndex(weeks);
    render();
  });
}

function groupWeeks(entries) {
  const grouped = new Map();

  entries.forEach((entry) => {
    if (!grouped.has(entry.weekKey)) {
      grouped.set(entry.weekKey, {
        key: entry.weekKey,
        vecka: entry.vecka,
        ar: entry.ar,
        entries: [],
      });
    }

    grouped.get(entry.weekKey).entries.push(entry);
  });

  return [...grouped.values()];
}

function findInitialWeekIndex(groupedWeeks) {
  const todayIso = getTodayIso();
  const containingWeek = groupedWeeks.findIndex((week) =>
    week.entries.some((entry) => entry.datum === todayIso),
  );

  if (containingWeek >= 0) {
    return containingWeek;
  }

  const firstFutureWeek = groupedWeeks.findIndex(
    (week) => week.entries[0]?.datum > todayIso,
  );

  return firstFutureWeek >= 0 ? firstFutureWeek : Math.max(groupedWeeks.length - 1, 0);
}

function render() {
  const week = weeks[currentWeekIndex];
  if (!week) {
    setStatus("Ingen kalenderdata hittades.");
    els.weekGrid.replaceChildren();
    els.weekLabel.textContent = "Ingen vecka";
    els.weekRange.textContent = "";
    return;
  }

  const firstDate = week.entries[0].dateObject;
  const lastDate = week.entries[week.entries.length - 1].dateObject;
  const yearLabel = week.ar === firstDate.getFullYear() ? week.ar : firstDate.getFullYear();

  els.weekLabel.textContent = `Vecka ${week.vecka}, ${yearLabel}`;
  els.weekRange.textContent = `${RANGE_DATE.format(firstDate)} till ${RANGE_DATE.format(lastDate)}`;

  els.prevWeek.disabled = currentWeekIndex === 0;
  els.nextWeek.disabled = currentWeekIndex === weeks.length - 1;

  const todayIso = getTodayIso();
  const isTodayVisible = week.entries.some((entry) => entry.datum === todayIso);
  setStatus(isTodayVisible ? "Dagens datum är markerat i veckan." : "Dagens datum ligger i en annan vecka.");

  const cards = week.entries.map((entry) => createDayCard(entry, todayIso));
  els.weekGrid.replaceChildren(...cards);
}

function createDayCard(entry, todayIso) {
  const fragment = els.template.content.cloneNode(true);
  const card = fragment.querySelector(".day-card");
  const owner = normalizeOwner(entry.hos);

  card.querySelector(".day-name").textContent = capitalize(entry.veckodag || SWEDISH_DATE.format(entry.dateObject).split(" ")[0]);
  card.querySelector(".day-date").textContent = SWEDISH_DATE.format(entry.dateObject);
  card.querySelector(".detail-value--owner").textContent = entry.hos || "";
  card.querySelector(".detail-value--timing").textContent = entry.hamtningsLamning || "";
  card.querySelector(".detail-value--notes").textContent = entry.anteckningar || "";

  if (owner === "mamma") {
    card.classList.add("day-card--mamma");
  }

  if (owner === "pappa") {
    card.classList.add("day-card--pappa");
  }

  if (entry.datum === todayIso) {
    card.classList.add("day-card--today");
  }

  return fragment;
}

function normalizeOwner(value) {
  return (value || "").trim().toLowerCase();
}

function parseCsv(csvText) {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  if (lines.length < 2) {
    return [];
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });

  return rows.map((row) => {
    const date = new Date(`${row["Datum"]}T00:00:00`);
    return {
      datum: row["Datum"],
      ar: date.getFullYear(),
      vecka: Number(row["Vecka"]),
      veckodag: row["Veckodag"] || "",
      hos: row["Hos"] || "",
      hamtningsLamning: row["Hämtning/Lämning"] || "",
      anteckningar: row["Anteckningar"] || "",
    };
  });
}

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function capitalize(value) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getTodayIso() {
  const today = new Date();
  const adjusted = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 10);
}

function setStatus(message) {
  els.status.textContent = message;
}
