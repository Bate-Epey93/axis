/* ============ AXIS — app ============ */
"use strict";

/* ---------- state ---------- */
const DB_KEY = "axis_v1";
const defaultState = () => ({
  onboarded: false,
  programStart: null,            // ISO date
  equipment: ["band"],           // gym handled via location, but kept ownable too
  gymDays: [0, 2],               // indexes into week (0=Day1)
  weekOrder: WEEK_DEFAULT.slice(),
  deloadUntil: null,             // ISO date if deload active
  lastDeloadPrompt: null,
  workoutLogs: [],               // {date, templateId, location, entries:[{exId, sets:[{reps, load, done}]}], completed}
  trackLogs: {},                 // date -> {pelvic, breath, mobility, mind, breathType}
  metrics: [],                   // {date, type, value}
  nutrition: {},                 // date -> {protein, sleep}
  pfPosition: "lying",
  settings: { coherenceRate: 6, sound: true },
});
let S = load();
function load() {
  try { const raw = localStorage.getItem(DB_KEY); if (raw) return Object.assign(defaultState(), JSON.parse(raw)); }
  catch (e) {}
  return defaultState();
}
function save() { localStorage.setItem(DB_KEY, JSON.stringify(S)); }

/* ---------- utils ---------- */
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => [...el.querySelectorAll(sel)];
const todayISO = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const fmtClock = s => Math.floor(s/60) + ":" + String(Math.floor(s%60)).padStart(2,"0");
const daysBetween = (a,b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function toast(msg, ms=2600) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), ms);
}

/* ---------- audio ---------- */
let AC = null;
function beep(freq=880, dur=0.12, vol=0.25) {
  if (!S.settings.sound) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === "suspended") AC.resume();
    const o = AC.createOscillator(), g = AC.createGain();
    o.frequency.value = freq; o.type = "sine";
    g.gain.setValueAtTime(vol, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
    o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + dur);
  } catch (e) {}
}
const beepHi = () => beep(1200, 0.15);
const beepLo = () => beep(600, 0.12);
const beepDone = () => { beep(880,0.1); setTimeout(()=>beep(1100,0.1),120); setTimeout(()=>beep(1320,0.2),240); };

/* ---------- program calendar ---------- */
function programDay() { // 0-based day index in the week cycle
  if (!S.programStart) return 0;
  return ((daysBetween(S.programStart, todayISO()) % 7) + 7) % 7;
}
function programWeek() {
  if (!S.programStart) return 1;
  return Math.floor(daysBetween(S.programStart, todayISO()) / 7) + 1;
}
function isRampWeeks() { return programWeek() <= 2; }
function isDeload() { return S.deloadUntil && todayISO() <= S.deloadUntil; }
function todayTemplate() { return TEMPLATES[S.weekOrder[programDay()]]; }
function weeksSinceDeload() {
  const anchor = S.lastDeloadPrompt || S.programStart;
  if (!anchor) return 0;
  return Math.floor(daysBetween(anchor, todayISO()) / 7);
}

/* ---------- substitution engine ---------- */
function availableEquipment(location) {
  if (location === "travel") return [];
  const owned = S.equipment.filter(e => e !== "gym");
  if (location === "gym") return owned.concat(["gym"]);
  return owned;
}
function pickExercise(pattern, avail) {
  const set = new Set(avail);
  const eligible = EXERCISES.filter(e => e.pattern === pattern && e.req.every(r => set.has(r)));
  eligible.sort((a,b) => b.priority - a.priority);
  return eligible[0] || null;
}
function alternativesFor(pattern, avail, excludeId) {
  const set = new Set(avail);
  return EXERCISES.filter(e => e.pattern === pattern && e.id !== excludeId && e.req.every(r => set.has(r)))
                  .sort((a,b) => b.priority - a.priority);
}

/* ---------- progression engine ---------- */
function lastEntryFor(exId) {
  for (let i = S.workoutLogs.length - 1; i >= 0; i--) {
    const log = S.workoutLogs[i];
    if (log.date === todayISO()) continue; // in-progress session isn't "last time"
    const ent = (log.entries || []).find(e => e.exId === exId && e.sets.some(s => s.done));
    if (ent) return { log, ent };
  }
  return null;
}
function progressionAdvice(ex, rx) {
  const last = lastEntryFor(ex.id);
  if (!last) return null;
  const doneSets = last.ent.sets.filter(s => s.done && s.reps != null);
  if (!doneSets.length) return null;
  const loads = doneSets.map(s => s.load).filter(Boolean);
  const loadStr = loads.length ? " @ " + esc(loads[loads.length-1]) : "";
  const repStr = doneSets.map(s => s.reps).join("/");
  const allTop = doneSets.length >= rx.sets && doneSets.every(s => s.reps >= rx.repHi);
  const missedBottom = doneSets.filter(s => s.reps < rx.repLo).length >= 2;
  if (allTop) {
    const step = ex.ladder && ex.ladder.length ? ex.ladder[Math.min(1, ex.ladder.length-1)] : "+load";
    return { cls:"suggest", html:`Last time: <b>${doneSets.length}×${repStr}${loadStr}</b> — top of range hit. <b>Progress: ${esc(step)}</b>` };
  }
  if (missedBottom) {
    return { cls:"regress", html:`Last time: <b>${doneSets.length}×${repStr}${loadStr}</b> — under range on 2+ sets. Hold or regress; possible fatigue. Sleep + protein first.` };
  }
  return { cls:"", html:`Last time: <b>${doneSets.length}×${repStr}${loadStr}</b> — try +1 rep on your weakest set.` };
}

/* ---------- streaks ---------- */
function trackStreak(key) {
  let streak = 0; const d = new Date();
  // today counts if done; otherwise start from yesterday
  const t = S.trackLogs[todayISO()];
  if (!(t && t[key])) d.setDate(d.getDate() - 1);
  for (;;) {
    const iso = d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
    const log = S.trackLogs[iso];
    if (log && log[key]) { streak++; d.setDate(d.getDate()-1); } else break;
  }
  return streak;
}
function workoutStreak() {
  const dates = new Set(S.workoutLogs.filter(l => l.completed).map(l => l.date));
  let streak = 0; const d = new Date();
  if (!dates.has(todayISO())) d.setDate(d.getDate()-1);
  for (;;) {
    const iso = d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
    if (!S.programStart || iso < S.programStart) break;
    const dayIdx = (((daysBetween(S.programStart, iso) % 7) + 7) % 7);
    const isRest = S.weekOrder[dayIdx] === "rest";
    if (dates.has(iso) || isRest) { streak++; d.setDate(d.getDate()-1); }
    else break;
    if (streak > 999) break;
  }
  return streak;
}
function consecutiveTrainingDays() {
  let n = 0; const d = new Date();
  for (;;) {
    const iso = d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
    if (S.workoutLogs.some(l => l.date === iso && l.completed && l.templateId !== "light")) { n++; d.setDate(d.getDate()-1); }
    else break;
  }
  return n;
}

/* ---------- metrics ---------- */
function metricSeries(type) { return S.metrics.filter(m => m.type === type).sort((a,b) => a.date < b.date ? -1 : 1); }
function latestMetric(type) { const s = metricSeries(type); return s[s.length-1] || null; }
function metricDue(type) {
  const m = latestMetric(type);
  if (!m) return true;
  return daysBetween(m.date, todayISO()) >= 28;
}
function addMetric(type, value) {
  S.metrics.push({ date: todayISO(), type, value: parseFloat(value) });
  save();
}

/* =====================================================================
   RENDERING
===================================================================== */
let currentTab = "today";
function render() {
  const scr = $("#screen");
  if (!S.onboarded) { scr.innerHTML = renderOnboarding(); bindOnboarding(); $("#tabbar").classList.add("hidden"); return; }
  $("#tabbar").classList.remove("hidden");
  if (currentTab === "today") scr.innerHTML = renderToday();
  else if (currentTab === "progress") { scr.innerHTML = renderProgress(); drawAllCharts(); }
  else if (currentTab === "plan") scr.innerHTML = renderPlan();
  else if (currentTab === "equip") scr.innerHTML = renderEquipment();
  else if (currentTab === "more") scr.innerHTML = renderMore();
  $$("#tabbar .tab").forEach(t => t.classList.toggle("active", t.dataset.tab === currentTab));
  scr.scrollTop = 0;
}

/* ---------- Today ---------- */
function renderToday() {
  const tpl = todayTemplate();
  const week = programWeek();
  const dateStr = new Date().toLocaleDateString(undefined, { weekday:"long", month:"short", day:"numeric" });
  const tl = S.trackLogs[todayISO()] || {};
  const doneToday = S.workoutLogs.some(l => l.date === todayISO() && l.completed);
  const consec = consecutiveTrainingDays();
  const overtraining = consec >= 6 && tpl.type !== "REST";
  const deloadDue = !isDeload() && weeksSinceDeload() >= 5;

  let sessionCard;
  if (tpl.type === "REST") {
    sessionCard = `
      <div class="card stripe rest">
        <div class="card-row"><div class="dot rest"></div><div>
          <h3>Rest day</h3><div class="meta">${esc(tpl.desc)}</div>
        </div></div>
        <div class="info-note">Recovery is when adaptation happens. Daily tracks below still count today.</div>
      </div>`;
  } else {
    sessionCard = `
      <div class="card stripe ${tpl.color} tappable" data-act="open-session">
        <div class="card-row">
          <div style="flex:1">
            <div class="chip ${tpl.color} on">${tpl.type}${isDeload() ? " · DELOAD −40%" : ""}${isRampWeeks() ? " · WEEK "+week+" RAMP" : ""}</div>
            <h3 style="margin-top:8px; font-size:1.3rem;">${esc(tpl.label)}</h3>
            <div class="meta">${esc(tpl.desc)}</div>
            <div class="meta num" style="margin-top:6px;">${tpl.slots.length} movement slots · fills with what you have today</div>
          </div>
        </div>
        <button class="btn ${tpl.color}" style="margin-top:14px;" data-act="open-session">${doneToday ? "✓ Completed — reopen" : "Start session"}</button>
      </div>`;
  }

  const warn = overtraining ? `
    <div class="card warn-card">
      <h3>⚠︎ ${consec} hard days in a row</h3>
      <div class="info-note">Seven straight days drives cortisol up and testosterone down. Take the rest day, or swap today for light mobility.</div>
      <div class="btn-row" style="margin-top:12px;">
        <button class="btn ghost sm" data-act="swap-light">Swap to light mobility</button>
      </div>
    </div>` : "";

  const deloadCard = deloadDue ? `
    <div class="card due-card">
      <h3>Deload week is due</h3>
      <div class="meta">It's been ${weeksSinceDeload()} weeks of loading. One easy week (−40% volume) lets the gains land.</div>
      <div class="btn-row" style="margin-top:12px;">
        <button class="btn primary sm" data-act="start-deload">Start deload</button>
        <button class="btn ghost sm" data-act="snooze-deload">Next week</button>
      </div>
    </div>` : "";

  const tracks = [
    { key:"pelvic",  cls:"pelvic",   name:"Pelvic floor",  sub:"3 sets · holds + flicks", streak: trackStreak("pelvic") },
    { key:"breath",  cls:"breath",   name:"Breathwork",    sub:"Coherence · box · BOLT",  streak: trackStreak("breath") },
    { key:"mobility",cls:"mobility", name:"Mobility",      sub:"5-min flow",              streak: trackStreak("mobility") },
    { key:"mind",    cls:"mind",     name:"Meditation",    sub:"Solar plexus · 5–10 min", streak: trackStreak("mind") },
  ];
  const trackGrid = `<div class="track-grid">` + tracks.map(t => `
    <button class="track-card ${t.cls} ${tl[t.key] ? "done "+t.cls : ""}" data-act="open-track" data-track="${t.key}">
      <div class="dot ${t.cls}"></div>
      <div>
        <div class="t-name">${t.name}</div>
        <div class="t-sub">${t.sub}</div>
        <div class="streak num" style="margin-top:6px;"><span class="flame">🔥</span>${t.streak}d</div>
      </div>
      <div class="t-check">✓</div>
    </button>`).join("") + `</div>`;

  const dueMetrics = Object.keys(METRIC_DEFS).filter(t => ["BOLT","WAIST","BENCHMARK"].includes(t) && metricDue(t));
  const dueCard = dueMetrics.length && !isRampWeeks() ? `
    <div class="card due-card tappable" data-act="goto-progress">
      <h3>Re-measure due</h3>
      <div class="meta">${dueMetrics.map(t => METRIC_DEFS[t].label).join(" · ")} — monthly check-in. Tap to log.</div>
    </div>` : "";

  return `
    <div class="hdr"><h1>Axis</h1><span class="date">${esc(dateStr)}</span></div>
    <div class="sub num">Week ${week} · Day ${programDay()+1} of 7 · workout streak <b>🔥 ${workoutStreak()}d</b></div>
    ${warn}${deloadCard}
    ${sessionCard}
    <div class="sec">Daily tracks — the floor</div>
    ${trackGrid}
    ${dueCard}
    <div class="sec">Quick timers</div>
    <div class="btn-row">
      <button class="btn ghost sm" data-act="open-hiit-timer">HIIT timer</button>
      <button class="btn ghost sm" data-act="open-box">Box breath</button>
      <button class="btn ghost sm" data-act="open-bolt">BOLT test</button>
    </div>`;
}

/* ---------- Progress ---------- */
function renderProgress() {
  const types = ["BOLT","WAIST","BODYWEIGHT","BENCHMARK","LIFT_SQUAT","LIFT_HINGE","LIFT_PUSH","LIFT_PULL"];
  const cards = types.map(t => {
    const def = METRIC_DEFS[t]; const series = metricSeries(t);
    const latest = series[series.length-1]; const prev = series[series.length-2];
    let deltaHtml = `<span class="delta flat">—</span>`;
    if (latest && prev) {
      const d = latest.value - prev.value;
      const good = def.goodDir === 0 ? "flat" : (d * def.goodDir > 0 ? "up" : (d === 0 ? "flat" : "down"));
      deltaHtml = `<span class="delta ${good} num">${d > 0 ? "+" : ""}${Math.round(d*10)/10} ${def.unit}</span>`;
    }
    const due = metricDue(t) && ["BOLT","WAIST","BENCHMARK","BODYWEIGHT"].includes(t);
    return `
      <div class="card chart-card ${due ? "due-card" : ""}">
        <div class="metric-head">
          <div><h3>${def.label}${due ? " · due" : ""}</h3>${def.note ? `<div class="meta">${def.note}</div>` : ""}</div>
          <div style="text-align:right;"><div class="val num">${latest ? latest.value + " " + def.unit : "—"}</div>${deltaHtml}</div>
        </div>
        ${series.length > 1 ? `<canvas data-chart="${t}" width="600" height="300"></canvas>` : `<div class="info-note">Log at least two entries to see the trend.</div>`}
        <button class="btn ghost sm" style="margin-top:10px;" data-act="log-metric" data-type="${t}">Log ${def.label.toLowerCase()}</button>
      </div>`;
  }).join("");
  const deloadIn = Math.max(0, 5 - weeksSinceDeload());
  return `
    <div class="hdr"><h1>Progress</h1></div>
    <div class="sub">Sexual stamina, breath, and mobility move on an <b>8–12 week</b> horizon. Judge trends, not days.</div>
    <div class="card"><div class="card-row"><div class="dot rest"></div><div><h3 class="num">Deload in ~${deloadIn} week${deloadIn===1?"":"s"}</h3><div class="meta">Every 4–6 weeks, volume drops 40% for 7 days.</div></div></div></div>
    ${cards}`;
}

function drawAllCharts() {
  $$("canvas[data-chart]").forEach(cv => {
    const type = cv.dataset.chart; const def = METRIC_DEFS[type];
    const series = metricSeries(type); if (series.length < 2) return;
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height, P = 28;
    ctx.clearRect(0,0,W,H);
    const vals = series.map(m => m.value);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi === lo) { hi += 1; lo -= 1; }
    const pad = (hi-lo)*0.15; lo -= pad; hi += pad;
    const x = i => P + (W-2*P) * (i/(series.length-1));
    const y = v => H-P - (H-2*P) * ((v-lo)/(hi-lo));
    // faint grid
    ctx.strokeStyle = "#26262A"; ctx.lineWidth = 1;
    for (let g=0; g<4; g++) { const gy = P + (H-2*P)*g/3; ctx.beginPath(); ctx.moveTo(P,gy); ctx.lineTo(W-P,gy); ctx.stroke(); }
    // area fill
    ctx.beginPath(); ctx.moveTo(x(0), y(vals[0]));
    vals.forEach((v,i) => ctx.lineTo(x(i), y(v)));
    ctx.lineTo(x(vals.length-1), H-P); ctx.lineTo(x(0), H-P); ctx.closePath();
    ctx.fillStyle = def.color + "22"; ctx.fill();
    // line
    ctx.beginPath(); ctx.moveTo(x(0), y(vals[0]));
    vals.forEach((v,i) => ctx.lineTo(x(i), y(v)));
    ctx.strokeStyle = def.color; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.stroke();
    // endpoint emphasis
    ctx.beginPath(); ctx.arc(x(vals.length-1), y(vals[vals.length-1]), 6, 0, Math.PI*2);
    ctx.fillStyle = def.color; ctx.fill();
    ctx.strokeStyle = "#0A0A0B"; ctx.lineWidth = 3; ctx.stroke();
  });
}

/* ---------- Plan ---------- */
function renderPlan() {
  const rows = S.weekOrder.map((tid, i) => {
    const t = TEMPLATES[tid];
    const isGymDay = S.gymDays.includes(i);
    const isStrength = t.type === "STRENGTH";
    return `
      <div class="week-row">
        <div class="day-l num">Day ${i+1}${programDay()===i ? " ●" : ""}</div>
        <div style="flex:1">
          <div class="day-name"><span class="dot ${t.color}" style="display:inline-block; margin-right:6px;"></span>${esc(t.label)}</div>
          <div class="day-sub">${esc(t.desc)}</div>
        </div>
        ${t.type !== "REST" ? `<button class="gym-toggle num ${isGymDay ? "on" : ""}" data-act="toggle-gym" data-day="${i}">${isGymDay ? "GYM" : "HOME"}</button>` : ""}
      </div>`;
  }).join("");
  return `
    <div class="hdr"><h1>Week plan</h1></div>
    <div class="sub">Mark which days the gym is likely. The heavy strength days should land on gym days — but every session has a full home fallback, so nothing blocks you.</div>
    <div class="card">${rows}</div>
    <div class="card">
      <h3>Scheduler rules</h3>
      <div class="info-note">· 6 days on, 1 off — the rest day is protected.<br>· Two heavy strength days are never stacked back-to-back.<br>· Any session is completable with band + bodyweight; gym just raises the ceiling.</div>
      <button class="btn ghost sm" style="margin-top:12px;" data-act="auto-schedule">Re-balance week around my gym days</button>
    </div>`;
}

/* scheduler: place strength days (lower/upper/power) on gym-marked days when possible,
   never adjacent strength, keep rest day last */
function autoSchedule() {
  const strength = ["lower","upper","power"];
  const other = ["hiit","zone2","light"];
  const order = new Array(7).fill(null);
  order[6] = "rest";
  const gymDays = S.gymDays.filter(d => d < 6).sort((a,b)=>a-b);
  const sQueue = strength.slice(); const placed = [];
  for (const d of gymDays) {
    if (!sQueue.length) break;
    if (placed.some(p => Math.abs(p - d) === 1)) continue; // no back-to-back strength
    order[d] = sQueue.shift(); placed.push(d);
  }
  for (let d = 0; d < 6 && sQueue.length; d++) {
    if (order[d] || placed.some(p => Math.abs(p-d) === 1)) continue;
    order[d] = sQueue.shift(); placed.push(d);
  }
  const oQueue = other.slice();
  for (let d = 0; d < 6; d++) if (!order[d]) order[d] = oQueue.shift() || "light";
  S.weekOrder = order; save(); render();
  toast("Week re-balanced around your gym days");
}

/* ---------- Equipment ---------- */
function nextBuyRecommendation() {
  if (!S.equipment.includes("pullup_bar")) return { id:"pullup_bar", why:"Band pulldowns cap your vertical pull. A pull-up bar is the single highest-leverage purchase for your back and V-taper." };
  if (!S.equipment.includes("jump_rope")) return { id:"jump_rope", why:"Cheapest quality cardio there is — footwork, calves, and HIIT fuel." };
  if (!S.equipment.includes("kettlebell") && !S.equipment.includes("dumbbells")) return { id:"kettlebell", why:"One bell unlocks loaded hinges, carries, and ballistic power at home — gym independence." };
  if (!S.equipment.includes("rings")) return { id:"rings", why:"Rings unlock dips, rows, and the road to a muscle-up." };
  if (!S.equipment.includes("hr_monitor")) return { id:"hr_monitor", why:"Zone-guided HIIT and real recovery data — the instrumentation tier." };
  return null;
}
function renderEquipment() {
  const rec = nextBuyRecommendation();
  const recEq = rec ? EQUIPMENT.find(e => e.id === rec.id) : null;
  const tiers = [1,2,3,4].map(tier => {
    const items = EQUIPMENT.filter(e => e.tier === tier);
    const ownedCount = items.filter(e => S.equipment.includes(e.id)).length;
    return `
      <div class="tier-card ${ownedCount === items.length ? "owned-tier" : ""}">
        <div class="tier-hdr">
          <h3>Tier ${tier} — ${TIER_NAMES[tier]}</h3>
          <span class="chip num">${ownedCount}/${items.length} · ${TIER_COST[tier]}</span>
        </div>
        ${items.map(e => `
          <div class="eq-row">
            <div><div class="eq-name">${esc(e.name)}</div><div class="eq-unlocks">${esc(e.unlocks)}</div></div>
            <button class="eq-check ${S.equipment.includes(e.id) ? "on" : ""}" data-act="toggle-eq" data-eq="${e.id}" aria-label="Toggle ${esc(e.name)}"></button>
          </div>`).join("")}
      </div>`;
  }).join("");
  const poolSize = EXERCISES.filter(ex => ex.req.every(r => S.equipment.includes(r) || r === "gym")).length;
  return `
    <div class="hdr"><h1>Equipment</h1></div>
    <div class="sub num">Toggle "I got this" and the exercise pool expands instantly — <b>${poolSize}</b> of ${EXERCISES.length} exercises currently eligible (gym days unlock the rest).</div>
    ${recEq ? `
      <div class="card next-buy">
        <div class="chip mind on">Next buy</div>
        <h3 style="margin-top:8px;">${esc(recEq.name)}</h3>
        <div class="info-note">${esc(rec.why)}</div>
        <button class="btn mind sm" style="margin-top:12px;" data-act="toggle-eq" data-eq="${recEq.id}">I got this ✓</button>
      </div>` : `<div class="card"><h3>Fully equipped 🏆</h3><div class="meta">Every tier unlocked. The ceiling is now you.</div></div>`}
    ${tiers}`;
}

/* ---------- More (nutrition & recovery + settings) ---------- */
function renderMore() {
  const n = S.nutrition[todayISO()] || {};
  const month = new Date().getMonth(); // 0-11
  const vitD = month >= 9 || month <= 2; // Oct–Mar in Toronto
  const bw = latestMetric("BODYWEIGHT");
  const proteinTarget = bw ? Math.round(bw.value * 2.2 * 0.9) : null; // ~0.9 g/lb
  return `
    <div class="hdr"><h1>Recovery</h1></div>
    <div class="sub">Light touch. Reminders and targets, not obsessive logging.</div>

    <div class="card stripe nutrition">
      <h3>Protein today ${n.protein ? "✓" : ""}</h3>
      <div class="meta num">${proteinTarget ? `Target ≈ ${proteinTarget} g (0.8–1 g/lb).` : "Log bodyweight in Progress to get a target."} Spread over 3–4 feedings.</div>
      <button class="btn ${n.protein ? "ghost" : "nutrition"} sm" style="margin-top:10px;" data-act="toggle-protein">${n.protein ? "Undo" : "Hit my protein ✓"}</button>
    </div>

    <div class="card stripe nutrition">
      <h3>Slight deficit, not a diet</h3>
      <div class="info-note">Maintenance minus 200–300 kcal. Small enough to protect testosterone and training, big enough to shrink the waist. The waist tape — not the scale — is the referee.</div>
    </div>

    <div class="card stripe mind">
      <h3>Sleep ${n.sleep ? `· <span class="num">${n.sleep} h</span>` : ""}</h3>
      <div class="meta">Wind-down = box breathing + meditation. Below 7 h, consider making tomorrow lighter.</div>
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn ghost sm" data-act="log-sleep">Log hours</button>
        <button class="btn breath sm" data-act="open-box">Wind-down breath</button>
      </div>
    </div>

    ${vitD ? `
    <div class="card stripe mind">
      <h3>Toronto winter — Vitamin D</h3>
      <div class="info-note">October–March, sun exposure won't cover it at this latitude. 1000–2000 IU/day with a meal is the standard evidence-based range; confirm with bloodwork.</div>
    </div>` : ""}

    <div class="card">
      <h3>Micronutrients</h3>
      <div class="info-note">Zinc + magnesium support testosterone and sleep — food first (red meat, shellfish, seeds, leafy greens). <b>Baseline bloodwork</b> (total/free T, vitamin D, thyroid) is worth doing before leaning hard into the hormone goals.</div>
    </div>

    <div class="card">
      <h3>Stress = the hidden lift</h3>
      <div class="info-note">Every coherence or meditation session is cortisol management, and cortisol is testosterone's direct antagonist. The soft stuff is the hard stuff.</div>
    </div>

    <div class="sec">Settings</div>
    <div class="card">
      <div class="eq-row"><div class="eq-name">Timer sounds</div>
        <button class="eq-check ${S.settings.sound ? "on" : ""}" data-act="toggle-sound" aria-label="Toggle sound"></button></div>
      <div class="eq-row"><div><div class="eq-name">Coherence rate</div><div class="eq-unlocks num">${S.settings.coherenceRate} breaths/min</div></div>
        <button class="btn ghost sm" data-act="cycle-rate">Change</button></div>
      <div class="eq-row"><div><div class="eq-name">Reset all data</div><div class="eq-unlocks">Wipes logs, metrics, streaks</div></div>
        <button class="btn ghost sm" data-act="reset-all">Reset</button></div>
    </div>`;
}

/* ---------- Onboarding ---------- */
let obStep = 0; const obData = { metrics:{} };
function renderOnboarding() {
  if (obStep === 0) return `
    <div style="display:flex; flex-direction:column; justify-content:center; min-height:80vh; gap:14px;">
      <div class="chip breath on" style="align-self:flex-start;">Peak-Condition Protocol</div>
      <h1 style="font-size:2.6rem; line-height:1.05;">Axis</h1>
      <p style="color:var(--text-2); font-size:1.05rem; line-height:1.55;">One plan. Six days on, one off. The app knows the protocol, tracks the loads, and always has a version of today's session you can actually do — gym or no gym.</p>
      <p style="color:var(--text-3); font-size:0.85rem; line-height:1.5;">Weeks 1–2 run in ramp mode: form-focused strength, daily tracks, baselines. Plyo and reaction work unlock in week 3.</p>
      <button class="btn primary" data-act="ob-next">Set my baselines</button>
    </div>`;
  if (obStep === 1) {
    return `
    <div class="hdr" style="margin-top:20px;"><h1>Baselines</h1></div>
    <div class="sub">Four numbers, measured once, honestly. Everything else is measured against these. Skip any you can't do right now.</div>
    ${BASELINES.map(b => `
      <div class="card">
        <h3>${b.label} <span style="color:var(--text-3); font-weight:500; font-size:0.8rem;">(${b.unit})</span></h3>
        <div class="meta">${b.hint}</div>
        <input class="big-input num" inputmode="decimal" data-ob-metric="${b.type}" placeholder="—">
      </div>`).join("")}
    <button class="btn primary" data-act="ob-finish">Start Week 1</button>
    <div class="info-note" style="text-align:center; margin-top:10px;">This spec is general evidence-based guidance, not medical advice. Baseline bloodwork is recommended before chasing the hormone goals hard.</div>`;
  }
  return "";
}
function bindOnboarding() {
  $("#screen").onclick = e => {
    const act = e.target.closest("[data-act]");
    if (!act) return;
    if (act.dataset.act === "ob-next") { obStep = 1; render(); }
    if (act.dataset.act === "ob-finish") {
      $$("[data-ob-metric]").forEach(inp => {
        const v = parseFloat(inp.value);
        if (!isNaN(v) && v > 0) S.metrics.push({ date: todayISO(), type: inp.dataset.obMetric, value: v });
      });
      S.onboarded = true; S.programStart = todayISO(); save();
      $("#screen").onclick = null;
      render(); toast("Week 1 ramp mode active — form first, load later");
    }
  };
}

/* =====================================================================
   SESSION PLAYER
===================================================================== */
let session = null; // { templateId, location, avail, slots:[{slot, ex, sets:[{reps,load,done}]}] }

function openLocationSheet() {
  const tpl = todayTemplate();
  if (tpl.type === "REST") { toast("Rest day — nothing to run. Enjoy it."); return; }
  showSheet(`
    <h3>Where are you today?</h3>
    <button class="opt-row" data-loc="gym"><span class="o-ico">🏋️</span><span>At the gym<span class="o-sub">Full equipment — heavy compounds selected</span></span></button>
    <button class="opt-row" data-loc="home"><span class="o-ico">🏠</span><span>Home<span class="o-sub">Your owned equipment: ${S.equipment.filter(e=>e!=="gym").map(id => (EQUIPMENT.find(q=>q.id===id)||{}).name).filter(Boolean).join(", ") || "bodyweight"}</span></span></button>
    <button class="opt-row" data-loc="travel"><span class="o-ico">🧳</span><span>Traveling<span class="o-sub">Bodyweight only — session still fully completable</span></span></button>
  `, sheet => {
    sheet.onclick = e => {
      const b = e.target.closest("[data-loc]");
      if (!b) return;
      closeSheet();
      startSession(b.dataset.loc);
    };
  });
}

function startSession(location) {
  const tpl = todayTemplate();
  const avail = availableEquipment(location);
  const ramp = isRampWeeks();
  const existing = S.workoutLogs.find(l => l.date === todayISO() && l.templateId === tpl.id);
  const slots = tpl.slots
    .filter(s => !(s.week3 && ramp))
    .map(slot => {
      const ex = ["MOBILITY","BREATH_HOLD"].includes(slot.pattern) ? null : pickExercise(slot.pattern, avail);
      let sets = slot.rx.sets;
      if (isDeload()) sets = Math.max(1, Math.round(sets * 0.6));
      const prior = existing && ex ? (existing.entries || []).find(en => en.exId === ex.id) : null;
      return { slot, ex, sets: prior ? prior.sets : Array.from({length: sets}, () => ({ reps:null, load:"", done:false })) };
    });
  session = { templateId: tpl.id, location, avail, slots, tpl };
  renderSession();
}

function renderSession() {
  const { tpl, slots, location } = session;
  const locLabel = { gym:"At the gym", home:"Home", travel:"Traveling" }[location];
  const ov = getOverlay();
  ov.innerHTML = `
    <div class="overlay-hdr">
      <div><h2>${esc(tpl.label)}</h2><div class="meta" style="color:var(--text-2); font-size:0.8rem;">${locLabel}${isDeload() ? " · deload −40% volume" : ""}${isRampWeeks() ? " · ramp mode" : ""}</div></div>
      <button class="x-btn" data-act="close-session">✕</button>
    </div>
    ${slots.map((s, si) => renderSlot(s, si)).join("")}
    <button class="btn primary" style="margin-top:8px;" data-act="finish-session">Finish session</button>
    <div style="height:90px;"></div>`;
  bindSession(ov);
}

function renderSlot(s, si) {
  const { slot, ex } = s;
  const rx = slot.rx;
  const unit = rx.unit || "reps";
  const allDone = s.sets.length && s.sets.every(x => x.done);
  const rxStr = rx.rest ? `${s.sets.length} × ${rx.repLo}–${rx.repHi} ${unit} · rest ${rx.rest}s` : `${rx.repLo}–${rx.repHi} ${unit}`;
  // special slots
  if (slot.useHiitTimer) return `
    <div class="slot-card stripe hiit ${allDone ? "done" : ""}">
      <span class="tag CARDIO">${PATTERN_LABEL[slot.pattern]}</span>
      <div class="ex-name">${esc(slot.target)}</div>
      <div class="rx">${esc(rx.notes || "")}</div>
      <button class="btn hiit" style="margin-top:12px;" data-act="hiit-from-session" data-si="${si}">Open HIIT timer</button>
      <button class="btn ghost sm" style="margin-top:8px;" data-act="mark-slot" data-si="${si}">${allDone ? "✓ Done" : "Mark done"}</button>
    </div>`;
  if (slot.useBreathHold) return `
    <div class="slot-card stripe breath ${allDone ? "done" : ""}">
      <span class="tag CARDIO">${PATTERN_LABEL[slot.pattern]}</span>
      <div class="ex-name">${esc(slot.target)}</div>
      <div class="rx">${esc(rx.notes || "")}</div>
      <button class="btn breath" style="margin-top:12px;" data-act="bh-from-session" data-si="${si}">Open breath-hold timer</button>
      <button class="btn ghost sm" style="margin-top:8px;" data-act="mark-slot" data-si="${si}">${allDone ? "✓ Done" : "Mark done"}</button>
    </div>`;
  if (slot.useMobility) return `
    <div class="slot-card stripe mobility ${allDone ? "done" : ""}">
      <span class="tag MOBILITY">${PATTERN_LABEL[slot.pattern]}</span>
      <div class="ex-name">${esc(slot.target)}</div>
      <button class="btn mobility" style="margin-top:12px;" data-act="mob-static-from-session" data-si="${si}">Open static player</button>
      <button class="btn ghost sm" style="margin-top:8px;" data-act="mark-slot" data-si="${si}">${allDone ? "✓ Done" : "Mark done"}</button>
    </div>`;
  if (!ex) return `
    <div class="slot-card"><span class="tag ${slot.pattern}">${PATTERN_LABEL[slot.pattern] || slot.pattern}</span>
    <div class="ex-name">${esc(slot.target)}</div>
    <div class="rx">${rxStr}</div>
    <button class="btn ghost sm" style="margin-top:8px;" data-act="mark-slot" data-si="${si}">${allDone ? "✓ Done" : "Mark done"}</button></div>`;

  const adv = progressionAdvice(ex, rx);
  const timeBased = unit === "s" || unit === "min";
  return `
    <div class="slot-card ${allDone ? "done" : ""}">
      <div class="slot-hdr">
        <div>
          <span class="tag ${slot.pattern}">${PATTERN_LABEL[slot.pattern]}</span>
          <div class="ex-name">${esc(ex.name)}</div>
          <div class="rx">${esc(slot.target)} · ${rxStr}</div>
          ${ex.power ? `<div class="power-flag">⚡ Power — full recovery between reps (${Math.max(rx.rest,120)}s enforced)</div>` : ""}
        </div>
        <button class="swap-btn" data-act="swap-ex" data-si="${si}">Swap</button>
      </div>
      ${adv ? `<div class="last-time ${adv.cls}">${adv.html}</div>` : ""}
      <div class="set-rows">
        ${s.sets.map((set, xi) => `
          <div class="set-row">
            <div class="set-n num">${xi+1}</div>
            <input inputmode="numeric" placeholder="${timeBased ? unit : "reps"}" value="${set.reps ?? ""}" data-set-reps data-si="${si}" data-xi="${xi}">
            <input placeholder="${session.location === "gym" ? "kg" : "band / load"}" value="${esc(set.load || "")}" data-set-load data-si="${si}" data-xi="${xi}">
            <button class="set-done ${set.done ? "on" : ""}" data-act="set-done" data-si="${si}" data-xi="${xi}">✓</button>
          </div>`).join("")}
      </div>
      ${ex.ladder ? `<div class="info-note">Ladder: ${ex.ladder.map(esc).join(" → ")}</div>` : ""}
    </div>`;
}

function bindSession(ov) {
  ov.oninput = e => {
    const t = e.target;
    if (t.matches("[data-set-reps]")) session.slots[t.dataset.si].sets[t.dataset.xi].reps = parseInt(t.value) || null;
    if (t.matches("[data-set-load]")) session.slots[t.dataset.si].sets[t.dataset.xi].load = t.value;
    persistSession(false);
  };
  ov.onclick = e => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act, si = b.dataset.si, xi = b.dataset.xi;
    if (act === "close-session") { persistSession(false); stopRestTimer(); closeOverlay(); render(); }
    if (act === "set-done") {
      const set = session.slots[si].sets[xi];
      set.done = !set.done;
      persistSession(false);
      if (set.done) {
        beepLo();
        const slot = session.slots[si];
        const isLastSet = slot.sets.every(s => s.done);
        const rest = slot.ex && slot.ex.power ? Math.max(slot.slot.rx.rest, 120) : slot.slot.rx.rest;
        if (!isLastSet && rest) startRestTimer(rest, slot.ex && slot.ex.power);
        if (isLastSet) stopRestTimer();
      }
      renderSession();
    }
    if (act === "mark-slot") { session.slots[si].sets.forEach(s => s.done = !session.slots[si].sets.every(x=>x.done) ? true : false); persistSession(false); renderSession(); }
    if (act === "swap-ex") openSwapSheet(parseInt(si));
    if (act === "hiit-from-session") openHiitTimer(session.tpl.hiitDefault);
    if (act === "bh-from-session") openBreathHold();
    if (act === "mob-static-from-session") openMobilityPlayer("static");
    if (act === "finish-session") finishSession();
  };
}

function openSwapSheet(si) {
  const s = session.slots[si];
  const alts = alternativesFor(s.slot.pattern, session.avail, s.ex ? s.ex.id : null);
  showSheet(`
    <h3>Swap — ${PATTERN_LABEL[s.slot.pattern]}</h3>
    ${alts.length ? alts.map(a => `
      <button class="opt-row" data-swap="${a.id}"><span>${esc(a.name)}<span class="o-sub">${a.req.length ? "Needs: " + a.req.map(r => (EQUIPMENT.find(q=>q.id===r)||{name:r}).name).join(", ") : "Bodyweight"}</span></span></button>
    `).join("") : `<div class="info-note">No alternatives with today's equipment.</div>`}
  `, sheet => {
    sheet.onclick = e => {
      const b = e.target.closest("[data-swap]");
      if (!b) return;
      s.ex = EXERCISES.find(x => x.id === b.dataset.swap);
      closeSheet(); renderSession();
    };
  });
}

function persistSession(completed) {
  const entries = session.slots.filter(s => s.ex).map(s => ({ exId: s.ex.id, sets: s.sets }));
  let log = S.workoutLogs.find(l => l.date === todayISO() && l.templateId === session.templateId);
  if (!log) { log = { date: todayISO(), templateId: session.templateId, location: session.location, entries: [], completed: false }; S.workoutLogs.push(log); }
  log.entries = entries; log.location = session.location;
  if (completed) log.completed = true;
  save();
}
function finishSession() {
  persistSession(true);
  stopRestTimer();
  // auto-log key lifts as metrics when at the gym with numeric loads
  const liftMap = { SQUAT:"LIFT_SQUAT", HINGE:"LIFT_HINGE", H_PUSH:"LIFT_PUSH", V_PULL:"LIFT_PULL" };
  session.slots.forEach(s => {
    if (!s.ex || session.location !== "gym") return;
    const mt = liftMap[s.slot.pattern]; if (!mt) return;
    const loads = s.sets.filter(x => x.done).map(x => parseFloat(x.load)).filter(v => !isNaN(v));
    if (loads.length) {
      const top = Math.max(...loads);
      const cur = latestMetric(mt);
      if (!cur || cur.date !== todayISO()) addMetric(mt, top);
      else cur.value = Math.max(cur.value, top);
    }
  });
  save();
  beepDone();
  closeOverlay();
  render();
  toast("Session logged. 🔥 " + workoutStreak() + "-day streak");
}

/* ---------- rest timer ---------- */
let restInt = null;
function startRestTimer(secs, isPower) {
  stopRestTimer();
  const bar = $("#restbar");
  bar.classList.remove("hidden");
  bar.classList.toggle("power", !!isPower);
  let left = secs;
  const draw = () => {
    $("#restbar .rt-time").textContent = fmtClock(left);
    $("#restbar .rt-fill").style.width = (left / secs * 100) + "%";
  };
  draw();
  restInt = setInterval(() => {
    left--;
    if (left <= 0) { stopRestTimer(); beepHi(); toast(isPower ? "Fully recovered — next explosive rep" : "Rest over — next set"); return; }
    if (left <= 3) beepLo();
    draw();
  }, 1000);
  $("#restbar [data-act='skip-rest']").onclick = () => stopRestTimer();
  $("#restbar [data-act='add-rest']").onclick = () => { left += 30; draw(); };
}
function stopRestTimer() { clearInterval(restInt); restInt = null; $("#restbar").classList.add("hidden"); }

/* =====================================================================
   TIMERS & TRACK FLOWS
===================================================================== */
function getOverlay() {
  let ov = $("#overlay");
  if (!ov) { ov = document.createElement("div"); ov.id = "overlay"; ov.className = "overlay"; document.body.appendChild(ov); }
  ov.classList.remove("hidden");
  return ov;
}
let overlayCleanup = null;
function closeOverlay() {
  if (overlayCleanup) { overlayCleanup(); overlayCleanup = null; }
  const ov = $("#overlay"); if (ov) { ov.onclick = null; ov.oninput = null; ov.classList.add("hidden"); ov.innerHTML = ""; }
}
function overlayShell(title, colorCls, bodyHtml) {
  const ov = getOverlay();
  ov.innerHTML = `
    <div class="overlay-hdr"><h2>${title}</h2><button class="x-btn" data-act="ov-close">✕</button></div>
    ${bodyHtml}`;
  ov.querySelector("[data-act='ov-close']").onclick = () => { closeOverlay(); render(); };
  return ov;
}
function markTrack(key, extra) {
  const d = todayISO();
  S.trackLogs[d] = S.trackLogs[d] || {};
  S.trackLogs[d][key] = true;
  if (extra) Object.assign(S.trackLogs[d], extra);
  save();
}

/* ---------- HIIT timer ---------- */
function openHiitTimer(cfg) {
  let work = (cfg && cfg.work) || 30, rest = (cfg && cfg.rest) || 90, rounds = (cfg && cfg.rounds) || 6;
  const ov = overlayShell("HIIT timer", "hiit", `
    <div class="card">
      <div class="stepper"><button data-st="work-">−</button><div><div class="stv num hiit-work" id="st-work">${work}s</div><div class="meta" style="text-align:center;">work</div></div><button data-st="work+">+</button></div>
      <div class="stepper"><button data-st="rest-">−</button><div><div class="stv num hiit-rest" id="st-rest">${rest}s</div><div class="meta" style="text-align:center;">recover</div></div><button data-st="rest+">+</button></div>
      <div class="stepper"><button data-st="rounds-">−</button><div><div class="stv num" id="st-rounds">${rounds}</div><div class="meta" style="text-align:center;">rounds</div></div><button data-st="rounds+">+</button></div>
    </div>
    <div class="big-timer hidden" id="hiit-run">
      <div class="phase" id="h-phase">GET READY</div>
      <div class="clock num" id="h-clock">0:10</div>
      <div class="round num" id="h-round"></div>
      <button class="btn ghost" style="max-width:200px;" data-act="hiit-stop">Stop</button>
    </div>
    <button class="btn hiit" id="hiit-start">Start intervals</button>
    <div class="info-note">Work = talk-impossible effort (≳85% max HR). Recovery = easy movement, nasal breathing if you can.</div>`);
  let int = null;
  overlayCleanup = () => clearInterval(int);
  ov.onclick = e => {
    const st = e.target.closest("[data-st]");
    if (st) {
      const k = st.dataset.st;
      if (k === "work-") work = Math.max(10, work-5); if (k === "work+") work = Math.min(120, work+5);
      if (k === "rest-") rest = Math.max(15, rest-15); if (k === "rest+") rest = Math.min(240, rest+15);
      if (k === "rounds-") rounds = Math.max(1, rounds-1); if (k === "rounds+") rounds = Math.min(12, rounds+1);
      $("#st-work").textContent = work+"s"; $("#st-rest").textContent = rest+"s"; $("#st-rounds").textContent = rounds;
    }
    if (e.target.closest("#hiit-start")) runHiit();
    if (e.target.closest("[data-act='hiit-stop']")) { clearInterval(int); $("#hiit-run").classList.add("hidden"); $("#hiit-start").classList.remove("hidden"); }
    if (e.target.closest("[data-act='ov-close']")) { closeOverlay(); render(); }
  };
  function runHiit() {
    $("#hiit-start").classList.add("hidden");
    $("#hiit-run").classList.remove("hidden");
    let phase = "prep", left = 10, round = 1;
    const phaseEl = $("#h-phase"), clockEl = $("#h-clock"), roundEl = $("#h-round");
    const setUI = () => {
      const map = { prep:["GET READY","hiit-prep"], work:["WORK","hiit-work"], rest:["RECOVER","hiit-rest"], done:["DONE","hiit-done"] };
      phaseEl.textContent = map[phase][0];
      phaseEl.className = "phase " + map[phase][1];
      clockEl.className = "clock num " + map[phase][1];
      clockEl.textContent = fmtClock(left);
      roundEl.textContent = phase === "done" ? "All rounds complete" : `Round ${round} / ${rounds}`;
    };
    setUI();
    clearInterval(int);
    int = setInterval(() => {
      left--;
      if (left <= 3 && left > 0) beepLo();
      if (left <= 0) {
        if (phase === "prep") { phase = "work"; left = work; beepHi(); }
        else if (phase === "work") {
          if (round >= rounds) { phase = "done"; left = 0; clearInterval(int); beepDone(); markTrack("breath", {}); }
          else { phase = "rest"; left = rest; beepHi(); }
        }
        else if (phase === "rest") { round++; phase = "work"; left = work; beepHi(); }
      }
      setUI();
    }, 1000);
  }
}

/* ---------- Box breathing ---------- */
function openBoxBreathing() {
  const ov = overlayShell("Box breathing", "breath", `
    <div class="pacer-wrap">
      <div class="box-wrap">
        <div class="box-outline"></div>
        <div class="box-dot" id="box-dot"></div>
        <div class="box-label"><div class="bphase" id="bx-phase">Ready</div><div class="bcount num" id="bx-count">4</div></div>
      </div>
      <div class="round num" id="bx-total" style="color:var(--text-2); font-weight:700;">0:00</div>
      <button class="btn breath" style="max-width:240px;" id="bx-start">Begin — 4·4·4·4</button>
    </div>
    <div class="info-note" style="text-align:center;">Inhale 4 · hold 4 · exhale 4 · hold 4. Pre-lift focus or pre-sleep wind-down. 2–5 minutes.</div>`);
  let int = null, running = false;
  overlayCleanup = () => clearInterval(int);
  const SIDE = 240 - 18; // travel px
  $("#bx-start").onclick = () => {
    if (running) { clearInterval(int); running = false; $("#bx-start").textContent = "Resume"; return; }
    running = true; $("#bx-start").textContent = "Pause";
    const phases = ["Inhale","Hold","Exhale","Hold"];
    let pi = 0, count = 4, total = 0;
    const dot = $("#box-dot");
    const place = (pi, frac) => {
      // dot travels around square edges: top→right→bottom→left
      let x=0, y=0;
      if (pi===0) { x = frac*SIDE; y = 0; }
      else if (pi===1) { x = SIDE; y = frac*SIDE; }
      else if (pi===2) { x = SIDE - frac*SIDE; y = SIDE; }
      else { x = 0; y = SIDE - frac*SIDE; }
      dot.style.transform = `translate(${x}px, ${y}px)`;
    };
    const draw = () => {
      $("#bx-phase").textContent = phases[pi];
      $("#bx-count").textContent = count;
      $("#bx-total").textContent = fmtClock(total);
      place(pi, (4-count)/4);
    };
    draw();
    clearInterval(int);
    int = setInterval(() => {
      count--; total++;
      if (count <= 0) { pi = (pi+1)%4; count = 4; beepLo(); }
      draw();
      if (total >= 120 && total % 60 === 0) { markTrack("breath", { breathType:"box" }); }
    }, 1000);
  };
}

/* ---------- Coherence / meditation pacer ---------- */
function openCoherence(mode) {
  // mode: "coherence" | "meditation"
  const isMed = mode === "meditation";
  const rate = S.settings.coherenceRate; // breaths per min
  const half = Math.round(60 / rate / 2); // seconds per inhale/exhale
  const mins = isMed ? 7 : 6;
  const title = isMed ? "Solar-plexus meditation" : "Coherence breathing";
  const cls = isMed ? "mind" : "breath";
  const ov = overlayShell(title, cls, `
    <div class="pacer-wrap">
      <div class="pacer-circle" id="pc" ${isMed ? `style="border-color:var(--c-mind); color:var(--c-mind); background:radial-gradient(circle, rgba(255,214,10,0.22), rgba(255,214,10,0.05));"` : ""}>Ready</div>
      <div class="round num" id="pc-total" style="color:var(--text-2); font-weight:700;">${mins}:00 remaining</div>
      <button class="btn ${cls}" style="max-width:240px;" id="pc-start">Begin · ${rate} bpm</button>
    </div>
    <div class="info-note" style="text-align:center;">${isMed
      ? "One hand on the abdomen, just below the sternum. Breathe into the hand. Attention rests at the solar plexus; when it wanders, return on the exhale."
      : half + "s in through the nose · " + half + "s out. This is the cortisol-lowering, testosterone-protecting session — not a soft extra."}</div>`);
  let int = null, running = false;
  overlayCleanup = () => clearInterval(int);
  $("#pc-start").onclick = () => {
    if (running) { clearInterval(int); running = false; $("#pc-start").textContent = "Resume"; return; }
    running = true; $("#pc-start").textContent = "Pause";
    const pc = $("#pc");
    let left = mins * 60, inhale = true, phaseLeft = half;
    pc.style.transitionDuration = half + "s";
    const cycle = () => {
      pc.textContent = inhale ? "Inhale" : "Exhale";
      pc.classList.toggle("inhale", inhale);
      pc.classList.toggle("exhale", !inhale);
    };
    cycle();
    clearInterval(int);
    int = setInterval(() => {
      left--; phaseLeft--;
      if (phaseLeft <= 0) { inhale = !inhale; phaseLeft = half; cycle(); }
      $("#pc-total").textContent = fmtClock(Math.max(0,left)) + " remaining";
      if (left <= 0) {
        clearInterval(int); running = false;
        beepDone();
        markTrack(isMed ? "mind" : "breath", isMed ? {} : { breathType:"coherence" });
        pc.textContent = "Done ✓"; pc.classList.remove("inhale","exhale");
        $("#pc-start").textContent = "Again";
        toast(isMed ? "Meditation logged 🧘" : "Coherence session logged");
      }
    }, 1000);
  };
}

/* ---------- Breath-hold intervals ---------- */
function openBreathHold() {
  const ov = overlayShell("Breath-hold intervals", "breath", `
    <div class="big-timer">
      <div class="phase" id="bh-phase" style="color:var(--c-breath);">Walking pace</div>
      <div class="clock num" id="bh-clock">0:00</div>
      <div class="round num" id="bh-round">Round 0 · best hold —</div>
      <div class="btn-row" style="max-width:340px; width:100%;">
        <button class="btn breath" id="bh-btn">Exhale & hold</button>
      </div>
      <button class="btn ghost sm" id="bh-finish">Finish & log</button>
    </div>
    <div class="info-note">While walking: normal exhale → hold to <b>moderate</b> air hunger (not panic) → release, nasal-only recovery ≥60 s → repeat 5–8×. Never while driving or in water.</div>`);
  let int = null, holding = false, t = 0, rounds = 0, best = 0;
  overlayCleanup = () => clearInterval(int);
  const clock = $("#bh-clock"), phaseEl = $("#bh-phase"), roundEl = $("#bh-round"), btn = $("#bh-btn");
  btn.onclick = () => {
    if (!holding) {
      holding = true; t = 0; btn.textContent = "Release";
      phaseEl.textContent = "HOLDING — walk on"; phaseEl.style.color = "var(--c-hiit)";
      clearInterval(int);
      int = setInterval(() => { t++; clock.textContent = fmtClock(t); }, 1000);
    } else {
      holding = false; rounds++; best = Math.max(best, t);
      roundEl.textContent = `Round ${rounds} · best hold ${fmtClock(best)}`;
      btn.textContent = "Exhale & hold";
      phaseEl.textContent = "Nasal recovery — 60 s easy"; phaseEl.style.color = "var(--c-breath)";
      clearInterval(int);
      let rec = 60;
      clock.textContent = fmtClock(rec);
      int = setInterval(() => { rec--; clock.textContent = fmtClock(Math.max(0,rec)); if (rec<=0) { clearInterval(int); phaseEl.textContent = "Ready for next hold"; beepHi(); } }, 1000);
    }
  };
  $("#bh-finish").onclick = () => {
    clearInterval(int);
    if (rounds > 0) { markTrack("breath", { breathType:"holds", rounds }); toast(`${rounds} rounds · best ${fmtClock(best)} — logged`); }
    closeOverlay(); render();
  };
}

/* ---------- BOLT test ---------- */
function openBolt() {
  const ov = overlayShell("BOLT test", "breath", `
    <div class="big-timer">
      <div class="phase" style="color:var(--c-breath);" id="bolt-phase">Sit quietly · breathe normally</div>
      <div class="clock num" id="bolt-clock">0</div>
      <div class="round" id="bolt-note" style="max-width:300px; line-height:1.5;">Normal exhale through the nose, then start. Tap again at the <b>first urge</b> to breathe — the first swallow or diaphragm twitch. Not a max hold.</div>
      <button class="btn breath" style="max-width:260px;" id="bolt-btn">Exhale, then tap to start</button>
    </div>`);
  let int = null, t = 0, running = false;
  overlayCleanup = () => clearInterval(int);
  $("#bolt-btn").onclick = () => {
    if (!running) {
      running = true; t = 0;
      $("#bolt-phase").textContent = "Holding — tap at first urge";
      $("#bolt-btn").textContent = "First urge — stop";
      int = setInterval(() => { t++; $("#bolt-clock").textContent = t; }, 1000);
    } else {
      clearInterval(int); running = false;
      addMetric("BOLT", t);
      markTrack("breath", { breathType:"bolt" });
      $("#bolt-phase").textContent = "Logged ✓";
      const rating = t < 10 ? "Building the base — big room to grow" : t < 20 ? "Progressing — most start here" : t < 30 ? "Good functional breathing" : "Excellent CO₂ tolerance";
      $("#bolt-note").innerHTML = `<b class="num">${t}s</b> — ${rating}. Re-test monthly, rested.`;
      $("#bolt-btn").textContent = "Done";
      $("#bolt-btn").onclick = () => { closeOverlay(); render(); };
      beepDone();
    }
  };
}

/* ---------- Pelvic floor ---------- */
function openPelvic() {
  const pos = S.pfPosition;
  const posNext = { lying:"seated", seated:"standing", standing:"lying" };
  const ov = overlayShell("Pelvic floor", "pelvic", `
    <div class="card stripe pelvic">
      <div class="meta"><b style="color:var(--text);">Form:</b> isolate the PC muscle (the one that stops urine flow). Don't clench abs, glutes, or thighs. Breathe normally. Relax <i>fully</i> between reps — the release is half the rep.</div>
      <div class="eq-row" style="margin-top:8px;"><div><div class="eq-name">Position: ${pos}</div><div class="eq-unlocks">lying → seated → standing is the difficulty ladder</div></div>
        <button class="btn ghost sm" id="pf-pos">→ ${posNext[pos]}</button></div>
    </div>
    <div class="pacer-wrap" style="min-height:300px;">
      <div class="phase" id="pf-phase" style="font-weight:800; text-transform:uppercase; letter-spacing:0.15em; color:var(--c-pelvic); font-size:1.1rem;">Ready</div>
      <div class="clock num" id="pf-clock" style="font-size:3.4rem; font-weight:800;">—</div>
      <div class="pf-bar-wrap"><div class="pf-fill" id="pf-fill"></div></div>
      <div class="round num" id="pf-round" style="color:var(--text-2); font-weight:700;">Set 1 of 3</div>
      <button class="btn pelvic" style="max-width:260px;" id="pf-start">Start — slow holds</button>
    </div>
    <div class="info-note" style="text-align:center;">Set 1–2: slow — 5 s squeeze / 5 s full release × 10. Set 3: quick flicks — 1 s on / 1 s off × 15.</div>`);
  let int = null;
  overlayCleanup = () => clearInterval(int);
  $("#pf-pos").onclick = () => { S.pfPosition = posNext[pos]; save(); closeOverlay(); openPelvic(); };
  $("#pf-start").onclick = function () {
    this.classList.add("hidden");
    const fill = $("#pf-fill"), phaseEl = $("#pf-phase"), clockEl = $("#pf-clock"), roundEl = $("#pf-round");
    // sequence: 2 slow sets (10 reps of 5s/5s), rest 30s between, then flicks set (15 reps 1s/1s)
    let set = 1, rep = 1, squeezing = true, left = 5;
    const flickSet = () => set === 3;
    const setup = () => {
      const dur = flickSet() ? 1 : 5;
      left = dur;
      fill.style.transitionDuration = dur + "s";
      fill.style.width = squeezing ? "100%" : "0%";
      phaseEl.textContent = squeezing ? "SQUEEZE" : "RELEASE";
      phaseEl.style.color = squeezing ? "var(--c-pelvic)" : "var(--text-2)";
      clockEl.textContent = rep;
      roundEl.textContent = `Set ${set} of 3 · ${flickSet() ? "quick flicks" : "slow holds"} · rep ${rep}/${flickSet() ? 15 : 10}`;
    };
    setup();
    clearInterval(int);
    int = setInterval(() => {
      left--;
      if (left > 0) return;
      if (squeezing) { squeezing = false; setup(); if (!flickSet()) beepLo(); return; }
      // completed a rep
      squeezing = true; rep++;
      const maxRep = flickSet() ? 15 : 10;
      if (rep > maxRep) {
        set++; rep = 1;
        if (set > 3) {
          clearInterval(int);
          phaseEl.textContent = "Complete"; clockEl.textContent = "✓"; fill.style.width = "0%";
          roundEl.textContent = "3 sets done";
          markTrack("pelvic");
          beepDone(); toast("Pelvic floor logged · 🔥 " + trackStreak("pelvic") + "d");
          return;
        }
        beepHi();
      }
      setup();
      if (flickSet()) beep(1000, 0.06, 0.18);
    }, 1000);
  };
}

/* ---------- Mobility player ---------- */
function openMobilityPlayer(mode) {
  // enforce: static only allowed post-workout or on light day
  if (mode === "static") {
    const tpl = todayTemplate();
    const trainedToday = S.workoutLogs.some(l => l.date === todayISO() && l.completed);
    if (tpl.type !== "LIGHT" && tpl.type !== "REST" && !trainedToday) {
      toast("Deep statics before lifting sap power — do the dynamic flow now, statics after.");
      mode = "dynamic";
    }
  }
  const flow = MOBILITY_FLOWS[mode];
  const ov = overlayShell(flow.label, "mobility", `
    <div class="btn-row" style="margin-bottom:14px;">
      <button class="btn ghost sm ${mode==="dynamic"?"":" "}" data-mode="dynamic" ${mode==="dynamic"?'style="border-color:var(--c-mobility); color:var(--c-mobility);"':""}>Dynamic</button>
      <button class="btn ghost sm" data-mode="static" ${mode==="static"?'style="border-color:var(--c-mobility); color:var(--c-mobility);"':""}>Deep static</button>
    </div>
    <div class="big-timer" style="min-height:300px;">
      <div class="phase" id="mb-name" style="color:var(--c-mobility); font-size:1.25rem; letter-spacing:0; text-transform:none;">${esc(flow.moves[0].name)}</div>
      <div class="clock num" id="mb-clock">${fmtClock(flow.moves[0].secs)}</div>
      <div class="round" id="mb-cue" style="max-width:300px; line-height:1.5;">${esc(flow.moves[0].cue)}</div>
      <div class="round num" id="mb-prog" style="color:var(--text-3);">1 / ${flow.moves.length}</div>
      <button class="btn mobility" style="max-width:240px;" id="mb-start">Start flow</button>
    </div>`);
  let int = null;
  overlayCleanup = () => clearInterval(int);
  ov.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { clearInterval(int); closeOverlay(); openMobilityPlayer(b.dataset.mode); });
  $("#mb-start").onclick = function () {
    this.classList.add("hidden");
    let mi = 0, left = flow.moves[mi].secs;
    const draw = () => {
      $("#mb-name").textContent = flow.moves[mi].name;
      $("#mb-cue").textContent = flow.moves[mi].cue;
      $("#mb-clock").textContent = fmtClock(left);
      $("#mb-prog").textContent = (mi+1) + " / " + flow.moves.length;
    };
    draw();
    clearInterval(int);
    int = setInterval(() => {
      left--;
      if (left <= 0) {
        mi++;
        if (mi >= flow.moves.length) {
          clearInterval(int);
          $("#mb-name").textContent = "Flow complete ✓"; $("#mb-clock").textContent = "—"; $("#mb-cue").textContent = "";
          markTrack("mobility");
          beepDone(); toast("Mobility logged · 🔥 " + trackStreak("mobility") + "d");
          return;
        }
        left = flow.moves[mi].secs; beepHi();
      } else if (left <= 3) beepLo();
      draw();
    }, 1000);
  };
}

/* ---------- Breathwork hub ---------- */
function openBreathHub() {
  showSheet(`
    <h3>Breathwork</h3>
    <button class="opt-row" data-bw="coherence"><span class="o-ico">〰️</span><span>Coherence · ${S.settings.coherenceRate} bpm<span class="o-sub">5–10 min · the daily default</span></span></button>
    <button class="opt-row" data-bw="box"><span class="o-ico">⬜</span><span>Box breathing 4·4·4·4<span class="o-sub">Pre-lift focus / pre-sleep wind-down</span></span></button>
    <button class="opt-row" data-bw="holds"><span class="o-ico">🚶</span><span>Breath-hold intervals<span class="o-sub">Walking protocol · 2–3× per week</span></span></button>
    <button class="opt-row" data-bw="bolt"><span class="o-ico">⏱</span><span>BOLT test<span class="o-sub">The breathwork KPI · monthly${latestMetric("BOLT") ? ` · last: ${latestMetric("BOLT").value}s` : ""}</span></span></button>
  `, sheet => {
    sheet.onclick = e => {
      const b = e.target.closest("[data-bw]"); if (!b) return;
      closeSheet();
      const k = b.dataset.bw;
      if (k === "coherence") openCoherence("coherence");
      if (k === "box") openBoxBreathing();
      if (k === "holds") openBreathHold();
      if (k === "bolt") openBolt();
    };
  });
}

/* ---------- sheets ---------- */
function showSheet(html, bind) {
  closeSheet();
  const back = document.createElement("div");
  back.className = "sheet-back"; back.id = "sheet";
  back.innerHTML = `<div class="sheet">${html}</div>`;
  back.onclick = e => { if (e.target === back) closeSheet(); };
  document.body.appendChild(back);
  if (bind) bind(back.querySelector(".sheet"));
}
function closeSheet() { const s = $("#sheet"); if (s) s.remove(); }

/* ---------- metric logging sheet ---------- */
function openMetricSheet(type) {
  const def = METRIC_DEFS[type];
  if (type === "BOLT") { openBolt(); return; }
  const last = latestMetric(type);
  showSheet(`
    <h3>Log ${def.label}</h3>
    ${last ? `<div class="meta num" style="margin-bottom:8px;">Last: ${last.value} ${def.unit} on ${last.date}</div>` : ""}
    <input class="big-input num" inputmode="decimal" id="metric-in" placeholder="${def.unit}" autofocus>
    <button class="btn primary" id="metric-save">Save</button>
  `, sheet => {
    sheet.querySelector("#metric-save").onclick = () => {
      const v = parseFloat(sheet.querySelector("#metric-in").value);
      if (isNaN(v) || v <= 0) { toast("Enter a number"); return; }
      addMetric(type, v);
      closeSheet(); render(); toast(def.label + " logged");
    };
  });
}

/* =====================================================================
   GLOBAL EVENTS
===================================================================== */
$("#tabbar").addEventListener("click", e => {
  const t = e.target.closest(".tab"); if (!t) return;
  currentTab = t.dataset.tab; render();
});

$("#screen").addEventListener("click", e => {
  if (!S.onboarded) return; // onboarding binds its own
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act;
  if (act === "open-session") openLocationSheet();
  if (act === "open-track") {
    const k = b.dataset.track;
    if (k === "pelvic") openPelvic();
    if (k === "breath") openBreathHub();
    if (k === "mobility") openMobilityPlayer("dynamic");
    if (k === "mind") openCoherence("meditation");
  }
  if (act === "open-hiit-timer") openHiitTimer();
  if (act === "open-box") openBoxBreathing();
  if (act === "open-bolt") openBolt();
  if (act === "goto-progress") { currentTab = "progress"; render(); }
  if (act === "log-metric") openMetricSheet(b.dataset.type);
  if (act === "toggle-gym") {
    const d = parseInt(b.dataset.day);
    S.gymDays = S.gymDays.includes(d) ? S.gymDays.filter(x => x !== d) : S.gymDays.concat([d]);
    save(); render();
  }
  if (act === "auto-schedule") autoSchedule();
  if (act === "toggle-eq") {
    const id = b.dataset.eq;
    const had = S.equipment.includes(id);
    S.equipment = had ? S.equipment.filter(x => x !== id) : S.equipment.concat([id]);
    save(); render();
    if (!had) {
      const n = EXERCISES.filter(ex => ex.req.includes(id)).length;
      toast(`${(EQUIPMENT.find(q=>q.id===id)||{}).name} unlocked ${n} exercise${n===1?"":"s"} 🎉`);
    }
  }
  if (act === "start-deload") {
    const until = new Date(); until.setDate(until.getDate() + 7);
    S.deloadUntil = until.toISOString().slice(0,10);
    S.lastDeloadPrompt = todayISO();
    save(); render(); toast("Deload active — volume −40% for 7 days. Growth happens now.");
  }
  if (act === "snooze-deload") { S.lastDeloadPrompt = todayISO(); save(); render(); }
  if (act === "swap-light") {
    S.weekOrder[programDay()] = "light"; save(); render();
    toast("Today swapped to light mobility. Smart call.");
  }
  if (act === "toggle-protein") {
    const d = todayISO(); S.nutrition[d] = S.nutrition[d] || {};
    S.nutrition[d].protein = !S.nutrition[d].protein; save(); render();
  }
  if (act === "log-sleep") {
    showSheet(`<h3>Sleep last night</h3><input class="big-input num" inputmode="decimal" id="sleep-in" placeholder="hours"><button class="btn primary" id="sleep-save">Save</button>`, sheet => {
      sheet.querySelector("#sleep-save").onclick = () => {
        const v = parseFloat(sheet.querySelector("#sleep-in").value);
        if (isNaN(v)) return;
        const d = todayISO(); S.nutrition[d] = S.nutrition[d] || {};
        S.nutrition[d].sleep = v; save(); closeSheet(); render();
        if (v < 7) toast("Under 7 h — consider a lighter session today.");
      };
    });
  }
  if (act === "toggle-sound") { S.settings.sound = !S.settings.sound; save(); render(); }
  if (act === "cycle-rate") { S.settings.coherenceRate = S.settings.coherenceRate >= 7 ? 5 : S.settings.coherenceRate + 0.5; save(); render(); }
  if (act === "reset-all") {
    showSheet(`<h3>Reset everything?</h3><div class="meta" style="margin-bottom:14px;">All logs, metrics, and streaks will be wiped. This cannot be undone.</div>
      <button class="btn hiit" id="reset-yes">Yes, wipe it</button><button class="btn ghost" style="margin-top:10px;" id="reset-no">Cancel</button>`, sheet => {
      sheet.querySelector("#reset-yes").onclick = () => { localStorage.removeItem(DB_KEY); location.reload(); };
      sheet.querySelector("#reset-no").onclick = closeSheet;
    });
  }
});

/* ---------- service worker ---------- */
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

render();
