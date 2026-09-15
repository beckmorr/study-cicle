const STORAGE_KEY = "studyCycle.v1";

const defaultState = {
  weeklyHours: 0,
  nextId: 1,
  subjects: [],
  progress: {}
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    if (!parsed.subjects || !Array.isArray(parsed.subjects)) return structuredClone(defaultState);
    parsed.progress = parsed.progress || {};
    if (typeof parsed.weeklyHours !== "number") parsed.weeklyHours = defaultState.weeklyHours;
    if (typeof parsed.nextId !== "number") parsed.nextId = defaultState.nextId;
    return parsed;
  } catch (e) {
    return structuredClone(defaultState);
  }
}

let state = loadState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// Same formula as the original spreadsheet:
// rawWeight = (Difficulty + Content) * Weight
// factor1 = sum of rawWeight across all subjects
// factor3 = weekly hours available / factor1
// hours for a subject = FLOOR(rawWeight * factor3)
function computeResults() {
  const rawWeights = state.subjects.map(s => (Number(s.dificuldade) + Number(s.conteudo)) * Number(s.peso));
  const factor1 = rawWeights.reduce((a, b) => a + b, 0);
  const factor3 = factor1 > 0 ? state.weeklyHours / factor1 : 0;
  const results = rawWeights.map(rw => Math.floor(rw * factor3 + 1e-9));
  return { rawWeights, factor1, factor3, results };
}

function syncProgressLengths(results) {
  state.subjects.forEach((s, i) => {
    const target = results[i];
    const key = String(s.id);
    let arr = state.progress[key] || [];
    if (arr.length > target) arr = arr.slice(0, target);
    while (arr.length < target) arr.push(false);
    state.progress[key] = arr;
  });
  const validIds = new Set(state.subjects.map(s => String(s.id)));
  Object.keys(state.progress).forEach(k => {
    if (!validIds.has(k)) delete state.progress[k];
  });
}

function render() {
  const { results } = computeResults();
  syncProgressLengths(results);

  const weeklyHoursInput = document.getElementById("weeklyHours");
  if (document.activeElement !== weeklyHoursInput) {
    weeklyHoursInput.value = state.weeklyHours;
  }

  const tbody = document.getElementById("subjectsBody");
  tbody.innerHTML = "";
  if (state.subjects.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.className = "empty-state";
    td.textContent = 'No subjects yet — click "Add subject" to get started.';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  state.subjects.forEach((s, i) => {
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = s.name;
    nameInput.addEventListener("input", () => {
      s.name = nameInput.value;
      saveState();
      renderProgressOnly();
    });
    tdName.appendChild(nameInput);
    tr.appendChild(tdName);

    tr.appendChild(makeNumCell(s, "dificuldade", 1, 5, 1));
    tr.appendChild(makeNumCell(s, "peso", 0, null, 0.1));
    tr.appendChild(makeNumCell(s, "conteudo", 1, 5, 1));

    const tdResult = document.createElement("td");
    tdResult.className = "result";
    tdResult.textContent = results[i] + "h";
    tr.appendChild(tdResult);

    const tdRemove = document.createElement("td");
    tdRemove.className = "remove";
    const btn = document.createElement("button");
    btn.className = "icon-btn";
    btn.title = "Remove subject";
    btn.textContent = "✕";
    btn.addEventListener("click", () => {
      state.subjects = state.subjects.filter(x => x.id !== s.id);
      delete state.progress[String(s.id)];
      saveState();
      render();
    });
    tdRemove.appendChild(btn);
    tr.appendChild(tdRemove);

    tbody.appendChild(tr);
  });

  renderProgressOnly(results);
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function makeNumCell(subject, field, min, max, step) {
  const td = document.createElement("td");
  td.className = "num";
  const input = document.createElement("input");
  input.type = "number";
  input.min = min;
  if (max !== null) input.max = max;
  input.step = step;
  input.value = subject[field];
  input.addEventListener("input", () => {
    let v = parseFloat(input.value);
    if (isNaN(v)) v = min;
    if (max !== null) {
      v = clamp(v, min, max);
      if (String(v) !== input.value) input.value = v;
    }
    subject[field] = v;
    saveState();
    render();
  });
  td.appendChild(input);
  return td;
}

function renderProgressOnly(precomputedResults) {
  const results = precomputedResults || computeResults().results;
  const container = document.getElementById("progressContainer");
  container.innerHTML = "";

  const active = state.subjects
    .map((s, i) => ({ s, hours: results[i] }))
    .filter(x => x.hours > 0);

  if (active.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No hours distributed yet — adjust difficulty, weight and content for the subjects above.";
    container.appendChild(empty);
    return;
  }

  active.forEach(({ s }) => {
    const key = String(s.id);
    const arr = state.progress[key] || [];
    const done = arr.filter(Boolean).length;

    const block = document.createElement("div");
    block.className = "subject-block";

    const head = document.createElement("div");
    head.className = "subject-head";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = s.name || "(untitled)";
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = `${done}/${arr.length}h`;
    head.appendChild(name);
    head.appendChild(count);
    block.appendChild(head);

    const squares = document.createElement("div");
    squares.className = "squares";
    arr.forEach((isDone, idx) => {
      const sq = document.createElement("button");
      sq.className = "square" + (isDone ? " done" : "");
      sq.setAttribute("aria-label", `Hour ${idx + 1}`);
      sq.title = isDone ? "Marked as done — click to unmark" : "Click to mark as done";
      sq.addEventListener("click", () => {
        arr[idx] = !arr[idx];
        state.progress[key] = arr;
        saveState();
        renderProgressOnly();
      });
      squares.appendChild(sq);
    });
    block.appendChild(squares);
    container.appendChild(block);
  });
}

document.getElementById("weeklyHours").addEventListener("input", (e) => {
  const v = parseFloat(e.target.value);
  state.weeklyHours = isNaN(v) ? 0 : v;
  saveState();
  render();
});

document.getElementById("addSubjectBtn").addEventListener("click", () => {
  state.subjects.push({ id: state.nextId++, name: "(new subject)", dificuldade: 1, peso: 1, conteudo: 1 });
  saveState();
  render();
});

document.getElementById("resetProgressBtn").addEventListener("click", () => {
  if (!confirm("Uncheck all completed hours for this week?")) return;
  Object.keys(state.progress).forEach(k => {
    state.progress[k] = state.progress[k].map(() => false);
  });
  saveState();
  renderProgressOnly();
});

document.getElementById("clearAllBtn").addEventListener("click", () => {
  if (!confirm("Delete all subjects, hours and saved progress? This action cannot be undone.")) return;
  state = structuredClone(defaultState);
  saveState();
  render();
});

render();
