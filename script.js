const LIVE_CSV_URL = "https://docs.google.com/spreadsheets/d/1Veinh7xcEHV_R2tvMd-3oIUt3_EqWYrQTWi211fpL-c/export?format=csv&gid=0";
const FALLBACK_DATA_URL = "./data/calendar.json";
const EDIT_API_URL = window.CALENDAR_CONFIG?.editApiUrl || "";
const CLIENT_ID_STORAGE_KEY = "noah-calendar-client-id";

const SWEDISH_DATE = new Intl.DateTimeFormat("sv-SE", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const RANGE_DATE = new Intl.DateTimeFormat("sv-SE", {
  day: "numeric",
  month: "long",
});

const MONTH_TITLE = new Intl.DateTimeFormat("sv-SE", {
  month: "long",
  year: "numeric",
});

const els = {
  heroTitle: document.querySelector("#hero-title"),
  viewWeek: document.querySelector("#view-week"),
  viewMonth: document.querySelector("#view-month"),
  prevWeek: document.querySelector("#prev-week"),
  nextWeek: document.querySelector("#next-week"),
  todayWeek: document.querySelector("#today-week"),
  weekLabel: document.querySelector("#week-label"),
  weekRange: document.querySelector("#week-range"),
  weekGrid: document.querySelector("#week-grid"),
  monthView: document.querySelector(".month-view"),
  monthGrid: document.querySelector("#month-grid"),
  status: document.querySelector("#status"),
  template: document.querySelector("#day-card-template"),
  monthCellTemplate: document.querySelector("#month-cell-template"),
  editDialog: document.querySelector("#edit-dialog"),
  editForm: document.querySelector("#edit-form"),
  editTitle: document.querySelector("#edit-title"),
  editDate: document.querySelector("#edit-date"),
  editClose: document.querySelector("#edit-close"),
  editCancel: document.querySelector("#edit-cancel"),
  editSave: document.querySelector("#edit-save"),
  editDatum: document.querySelector("#edit-datum"),
  editHos: document.querySelector("#edit-hos"),
  editTid: document.querySelector("#edit-tid"),
  editNotering: document.querySelector("#edit-notering"),
};

let allEntries = [];
let entriesByDate = new Map();
let weeks = [];
let currentWeekIndex = 0;
let currentView = "week";
let currentMonth = null; // { year, month } där month är 0-indexerad

init().catch((error) => {
  setStatus("Kunde inte läsa kalenderdatan.");
  console.error(error);
});

async function init() {
  setStatus("Läser kalenderdata...");

  allEntries = await getNormalizedEntries();
  entriesByDate = indexByDate(allEntries);
  weeks = groupWeeks(allEntries);
  currentWeekIndex = findInitialWeekIndex(weeks);
  currentMonth = findInitialMonth();

  bindEvents();
  render();
}

function indexByDate(entries) {
  return new Map(entries.map((entry) => [entry.datum, entry]));
}

function findInitialMonth() {
  const todayIso = getTodayIso();
  const anchor = allEntries.find((entry) => entry.datum >= todayIso) || allEntries.at(-1);
  const date = anchor ? anchor.dateObject : new Date();
  return { year: date.getFullYear(), month: date.getMonth() };
}

async function getNormalizedEntries() {
  const rawEntries = await loadEntries();
  return rawEntries
    .map((entry) => normalizeEntry(entry))
    .sort((left, right) => left.datum.localeCompare(right.datum));
}

function normalizeEntry(entry) {
  const dateObject = new Date(`${entry.datum}T00:00:00`);

  return {
    ...entry,
    ar: entry.ar || dateObject.getFullYear(),
    vecka: Number(entry.vecka),
    veckodag: entry.veckodag || "",
    hos: entry.hos || "",
    hamtningsLamning: entry.hamtningsLamning || "",
    anteckningar: entry.anteckningar || "",
    dateObject,
    weekKey: `${entry.ar || dateObject.getFullYear()}-v${String(entry.vecka).padStart(2, "0")}`,
  };
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
  els.viewWeek.addEventListener("click", () => setView("week"));
  els.viewMonth.addEventListener("click", () => setView("month"));

  els.prevWeek.addEventListener("click", () => {
    if (currentView === "month") {
      stepMonth(-1);
    } else {
      currentWeekIndex -= 1;
    }
    render();
  });

  els.nextWeek.addEventListener("click", () => {
    if (currentView === "month") {
      stepMonth(1);
    } else {
      currentWeekIndex += 1;
    }
    render();
  });

  els.todayWeek.addEventListener("click", () => {
    currentWeekIndex = findInitialWeekIndex(weeks);
    currentMonth = findInitialMonth();
    render();
  });

  els.editClose.addEventListener("click", closeEditDialog);
  els.editCancel.addEventListener("click", closeEditDialog);
  els.editDialog.addEventListener("click", (event) => {
    if (event.target === els.editDialog) {
      closeEditDialog();
    }
  });
  els.editForm.addEventListener("submit", handleEditSubmit);
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

function setView(view) {
  if (view === currentView) {
    return;
  }

  currentView = view;

  const isMonth = view === "month";
  els.heroTitle.textContent = isMonth ? "Månadsvy" : "Veckovy";
  els.viewWeek.classList.toggle("is-active", !isMonth);
  els.viewMonth.classList.toggle("is-active", isMonth);
  els.viewWeek.setAttribute("aria-selected", String(!isMonth));
  els.viewMonth.setAttribute("aria-selected", String(isMonth));
  els.weekGrid.hidden = isMonth;
  els.monthView.hidden = !isMonth;

  render();
}

function stepMonth(direction) {
  const next = new Date(currentMonth.year, currentMonth.month + direction, 1);
  currentMonth = { year: next.getFullYear(), month: next.getMonth() };
}

function render() {
  if (currentView === "month") {
    renderMonth();
    return;
  }

  renderWeek();
}

function renderWeek() {
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

function renderMonth() {
  const { year, month } = currentMonth;
  const todayIso = getTodayIso();

  els.weekLabel.textContent = capitalize(MONTH_TITLE.format(new Date(year, month, 1)));
  els.weekRange.textContent = "";

  // Måndag = 0. Antal tomma celler före den första i månaden.
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Begränsa navigeringen till det spann vi har data för.
  const firstIso = allEntries[0]?.datum ?? "";
  const lastIso = allEntries.at(-1)?.datum ?? "";
  els.prevWeek.disabled = firstIso ? isoForDay(year, month, 1) <= firstIso : true;
  els.nextWeek.disabled = lastIso ? isoForDay(year, month, daysInMonth) >= lastIso : true;

  const cells = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    const blank = document.createElement("span");
    blank.className = "month-cell month-cell--empty";
    blank.setAttribute("aria-hidden", "true");
    cells.push(blank);
  }

  let hasData = false;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = isoForDay(year, month, day);
    const entry = entriesByDate.get(iso);
    if (entry) {
      hasData = true;
    }
    cells.push(createMonthCell(day, iso, entry, todayIso));
  }

  els.monthGrid.replaceChildren(...cells);
  setStatus(hasData ? "Månadsöversikt. Klicka på en dag för att redigera." : "Ingen kalenderdata för den här månaden.");
}

function createMonthCell(day, iso, entry, todayIso) {
  const fragment = els.monthCellTemplate.content.cloneNode(true);
  const cell = fragment.querySelector(".month-cell");
  const owner = normalizeOwner(entry?.hos);

  cell.querySelector(".month-cell__date").textContent = String(day);
  cell.querySelector(".month-cell__owner").textContent = entry?.hos || "";
  cell.querySelector(".month-cell__timing").textContent = entry?.hamtningsLamning || "";

  if (owner === "mamma") {
    cell.classList.add("month-cell--mamma");
  }

  if (owner === "pappa") {
    cell.classList.add("month-cell--pappa");
  }

  if (iso === todayIso) {
    cell.classList.add("month-cell--today");
  }

  if (entry?.anteckningar) {
    cell.classList.add("month-cell--has-note");
    cell.title = entry.anteckningar;
  }

  if (entry) {
    cell.setAttribute("aria-label", `${SWEDISH_DATE.format(entry.dateObject)}. Redigera.`);
    cell.addEventListener("click", () => openEditDialog(entry));
  } else {
    cell.disabled = true;
  }

  return fragment;
}

function isoForDay(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
  card.querySelector(".edit-button").addEventListener("click", () => openEditDialog(entry));

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

function openEditDialog(entry) {
  els.editTitle.textContent = capitalize(entry.veckodag || "");
  els.editDate.textContent = SWEDISH_DATE.format(entry.dateObject);
  els.editDatum.value = entry.datum;
  els.editHos.value = entry.hos || "";
  els.editTid.value = entry.hamtningsLamning || "";
  els.editNotering.value = entry.anteckningar || "";
  els.editDialog.showModal();
}

function closeEditDialog() {
  els.editForm.reset();
  els.editDialog.close();
}

async function handleEditSubmit(event) {
  event.preventDefault();

  const payload = {
    datum: els.editDatum.value,
    hos: els.editHos.value.trim(),
    hamtningsLamning: els.editTid.value.trim(),
    anteckningar: els.editNotering.value.trim(),
    meta: {
      clientId: getClientId(),
      savedFrom: window.location.href,
      userAgent: navigator.userAgent,
      clientTimestamp: new Date().toISOString(),
    },
  };

  const entry = allEntries.find((item) => item.datum === payload.datum);
  if (!entry) {
    setStatus("Kunde inte hitta dagen som skulle uppdateras.");
    return;
  }

  updateEntry(entry, payload);
  weeks = groupWeeks(allEntries);
  render();
  closeEditDialog();

  if (!EDIT_API_URL) {
    setStatus("Ändringen syns bara lokalt. Lägg till Apps Script-URL i index.html för att spara till Google Sheet.");
    return;
  }

  setStatus("Skickar ändringen till Google Sheet...");

  try {
    await postUpdate(payload);
    setStatus("Ändringen skickad. Kalendern läses om från Google Sheet.");
    window.setTimeout(refreshFromLiveSource, 1500);
  } catch (error) {
    console.error(error);
    setStatus("Kunde inte skicka ändringen till Google Sheet.");
  }
}

function updateEntry(entry, payload) {
  entry.hos = payload.hos;
  entry.hamtningsLamning = payload.hamtningsLamning;
  entry.anteckningar = payload.anteckningar;
}

async function postUpdate(payload) {
  await fetch(EDIT_API_URL, {
    method: "POST",
    mode: "no-cors",
    body: JSON.stringify(payload),
  });
}

async function refreshFromLiveSource() {
  try {
    allEntries = await getNormalizedEntries();
    entriesByDate = indexByDate(allEntries);
    weeks = groupWeeks(allEntries);
    currentWeekIndex = Math.min(currentWeekIndex, Math.max(weeks.length - 1, 0));
    render();
  } catch (error) {
    console.error(error);
    setStatus("Ändringen skickades, men sidan kunde inte läsa tillbaka kalendern.");
  }
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
    const date = new Date(`${row.Datum}T00:00:00`);
    return {
      datum: row.Datum,
      ar: date.getFullYear(),
      vecka: Number(row.Vecka),
      veckodag: row.Veckodag || "",
      hos: row.Hos || "",
      hamtningsLamning: row["Hämtning/Lämning"] || row["HÃ¤mtning/LÃ¤mning"] || "",
      anteckningar: row.Anteckningar || "",
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

function getClientId() {
  const existing = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const generated = `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, generated);
  return generated;
}
