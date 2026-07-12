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
  lastBackup: null,
  lastReview: null,
  comebackDismissed: null,
  customWorkouts: [],
  todayOverride: null,           // {id, date} — custom workout pinned to today
  dayOverrides: {},              // dayIdx -> {id, until|null} — custom workout replacing a weekly day
  settings: { coherenceRate: 6, sound: true, voice: true },
});
let S = load();
function load() {
  try { const raw = localStorage.getItem(DB_KEY); if (raw) return Object.assign(defaultState(), JSON.parse(raw)); }
  catch (e) {}
  return defaultState();
}
function save() { localStorage.setItem(DB_KEY, JSON.stringify(S)); }

/* ---------- theme ---------- */
function applyTheme() {
  const pref = (S.settings && S.settings.theme) || "dark";
  const dark = pref === "auto" ? !window.matchMedia("(prefers-color-scheme: light)").matches : pref === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? "#0B0B0E" : "#F3EFE6";
}
window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
  if ((S.settings && S.settings.theme) === "auto") { applyTheme(); render(); }
});

/* Ask the browser not to evict our storage (iOS/Android honor this for installed PWAs) */
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ---------- wake lock: keep the screen on while a timer/player overlay is up ---------- */
let wakeLock = null;
async function acquireWake() {
  try { if (navigator.wakeLock && !wakeLock) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {}
}
function releaseWake() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}
document.addEventListener("visibilitychange", () => {
  // wake locks are auto-released on tab hide; reacquire if an overlay is still open
  wakeLock = null;
  const ov = document.getElementById("overlay");
  if (document.visibilityState === "visible" && ov && !ov.classList.contains("hidden")) acquireWake();
});

/* ---------- backup ---------- */
function exportBackup() {
  const blob = new Blob([JSON.stringify(S, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "axis-backup-" + todayISO() + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  S.lastBackup = todayISO(); save(); render();
  toast("Backup exported — keep it somewhere safe");
}
function importBackup() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "application/json,.json";
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (typeof data !== "object" || !data || !("workoutLogs" in data) || !("trackLogs" in data)) throw new Error("bad");
        S = Object.assign(defaultState(), data);
        save(); render(); toast("Backup restored");
      } catch (e) { toast("That file isn't an Axis backup"); }
    };
    r.readAsText(f);
  };
  inp.click();
}
function backupDue() {
  if (!S.onboarded) return false;
  return S.lastBackup ? daysBetween(S.lastBackup, todayISO()) >= 35 : programWeek() >= 2;
}

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
/* ---------- voice guidance (Web Speech — offline, no assets) ---------- */
function say(text, opts) {
  if (!S.settings.voice || !("speechSynthesis" in window)) return;
  try {
    if (!opts || !opts.queue) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = (opts && opts.rate) || 1;
    speechSynthesis.speak(u);
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
function effectiveWeekOrder() { return isRampWeeks() ? WEEK_RAMP : S.weekOrder; }
function customAsTemplate(w) {
  return { id: "custom_" + w.id, label: w.name, type: "CUSTOM", color: "hiit",
    desc: WORKOUT_MODES[w.mode].label + " · " + customSummary(w),
    slots: w.exIds, custom: w };
}
function activeDayOverride(dayIdx) {
  const o = (S.dayOverrides || {})[dayIdx];
  if (!o) return null;
  if (o.until && todayISO() > o.until) return null;
  return (S.customWorkouts || []).find(x => x.id === o.id) || null;
}
function todayTemplate() {
  const t = S.todayOverride;
  if (t && t.date === todayISO()) {
    const w = (S.customWorkouts || []).find(x => x.id === t.id);
    if (w) return customAsTemplate(w);
  }
  const w = activeDayOverride(programDay());
  if (w) return customAsTemplate(w);
  return TEMPLATES[effectiveWeekOrder()[programDay()]];
}
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
    let step = ex.ladder && ex.ladder.length ? ex.ladder[Math.min(1, ex.ladder.length-1)] : "+load";
    const bi = bandIndexOf(loads[loads.length-1]);
    if (bi >= 0 && bi < BAND_ORDER.length - 1) step = `move up to the ${BAND_ORDER[bi+1]} band (or slow the eccentric)`;
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

/* ---------- comeback detection ---------- */
function lastWorkoutGap() {
  const done = S.workoutLogs.filter(l => l.completed);
  if (!done.length) return null;
  const last = done.reduce((a, l) => l.date > a ? l.date : a, done[0].date);
  return daysBetween(last, todayISO());
}

/* ---------- weekly review ---------- */
function isoDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function weekReviewDue() {
  if (!S.onboarded || programWeek() < 2 && programDay() < 6) return false;
  if (!S.lastReview) return programDay() === 6 || daysBetween(S.programStart, todayISO()) >= 6;
  return daysBetween(S.lastReview, todayISO()) >= 7;
}
function openWeeklyReview() {
  const from = isoDaysAgo(6), prevFrom = isoDaysAgo(13), prevTo = isoDaysAgo(7);
  const inRange = (l, a, b) => l.date >= a && l.date <= b;
  const thisLogs = S.workoutLogs.filter(l => l.completed && inRange(l, from, todayISO()));
  const prevLogs = S.workoutLogs.filter(l => l.completed && inRange(l, prevFrom, prevTo));
  const days = new Set(thisLogs.map(l => l.date)).size;
  const mins = Math.round(thisLogs.reduce((a, l) => a + (l.durationSecs || 0), 0) / 60);
  const prevMins = Math.round(prevLogs.reduce((a, l) => a + (l.durationSecs || 0), 0) / 60);
  const vol = Math.round(thisLogs.reduce((a, l) => a + sessionScore(l), 0));
  const prevVol = Math.round(prevLogs.reduce((a, l) => a + sessionScore(l), 0));
  const trackNames = { pelvic:"Pelvic floor", breath:"Breathwork", mobility:"Mobility", mind:"Meditation" };
  const trackCounts = {};
  for (const k of Object.keys(trackNames)) {
    trackCounts[k] = 0;
    for (let n = 0; n <= 6; n++) { const t = S.trackLogs[isoDaysAgo(n)]; if (t && t[k]) trackCounts[k]++; }
  }
  const weakest = Object.keys(trackCounts).sort((a, b) => trackCounts[a] - trackCounts[b])[0];
  const dues = ["BOLT","WAIST","BENCHMARK"].filter(t => metricDue(t)).map(t => METRIC_DEFS[t].label);
  let suggestion;
  if (days <= 2) suggestion = "Two or fewer sessions this week. Don't chase it — just make the next scheduled one.";
  else if (trackCounts[weakest] < 4) suggestion = trackNames[weakest] + " slipped to " + trackCounts[weakest] + "/7 — it's one tap, and it's the quiet work that moves your goals.";
  else if (prevMins && mins < prevMins * 0.7) suggestion = "A lighter week (" + mins + " vs " + prevMins + " min). Fine if intended — deload is a tool, drift isn't.";
  else if (prevVol && vol > prevVol * 1.05) suggestion = "Volume up on last week. Keep sleep and protein up so it lands as muscle.";
  else suggestion = "Steady week. Consistency is the whole strategy — do it again.";
  const trend = (cur, old, unit) => old ? `${cur} ${unit} <span style="color:${cur >= old ? "var(--c-nutrition)" : "var(--c-hiit)"}">(${cur >= old ? "+" : ""}${cur - old} vs last wk)</span>` : `${cur} ${unit}`;
  showSheet(`
    <div style="text-align:center; margin-bottom:6px;">${flameSVG("var(--c-mind)")}</div>
    <h3 style="text-align:center;">Weekly review</h3>
    <div class="meta" style="text-align:center; margin-bottom:14px;">Last 7 days</div>
    <div class="eq-row"><div class="eq-name">Sessions</div><div class="eq-unlocks num" style="font-size:1rem; color:var(--text);">${days} of 6 training days</div></div>
    <div class="eq-row"><div class="eq-name">Training time</div><div class="eq-unlocks num" style="font-size:1rem; color:var(--text);">${trend(mins, prevMins, "min")}</div></div>
    <div class="eq-row"><div class="eq-name">Volume score</div><div class="eq-unlocks num" style="font-size:1rem; color:var(--text);">${trend(vol, prevVol, "")}</div></div>
    ${Object.keys(trackNames).map(k => `<div class="eq-row"><div class="eq-name">${trackNames[k]}</div><div class="eq-unlocks num" style="color:${trackCounts[k] >= 5 ? "var(--c-nutrition)" : trackCounts[k] >= 3 ? "var(--text)" : "var(--c-hiit)"};">${trackCounts[k]}/7 days</div></div>`).join("")}
    ${dues.length ? `<div class="eq-row"><div class="eq-name">Due to re-measure</div><div class="eq-unlocks" style="color:var(--c-mind);">${dues.join(" · ")}</div></div>` : ""}
    <div class="card stripe mind" style="margin-top:12px;"><div class="meta"><b style="color:var(--text);">One thing:</b> ${suggestion}</div></div>
    <button class="btn primary" id="review-done">Done — next week</button>
  `, sheet => {
    sheet.querySelector("#review-done").onclick = () => { S.lastReview = todayISO(); save(); closeSheet(); render(); };
  });
}

/* ---------- calendar reminders (.ics — no server, phone-native alerts) ---------- */
function buildICS(trainTime, windTime) {
  const BYDAYS = ["MO","TU","WE","TH","FR","SA","SU"];
  const start = new Date(S.programStart + "T00:00:00");
  const restByday = BYDAYS[(start.getDay() + 6 + 6) % 7]; // JS sun=0 → mo-indexed, +6 days for rest day
  const trainDays = BYDAYS.filter(d => d !== restByday).join(",");
  const t = todayISO().replace(/-/g, "");
  const [th, tm] = trainTime.split(":"), [wh, wm] = windTime.split(":");
  const stamp = t + "T000000";
  const ev = (uid, dtstart, rrule, summary, desc) => [
    "BEGIN:VEVENT", "UID:" + uid + "@axis.local", "DTSTAMP:" + stamp,
    "DTSTART:" + dtstart, "RRULE:" + rrule,
    "SUMMARY:" + summary, "DESCRIPTION:" + desc,
    "BEGIN:VALARM", "TRIGGER:PT0M", "ACTION:DISPLAY", "DESCRIPTION:" + summary, "END:VALARM",
    "END:VEVENT",
  ].join("\r\n");
  const md = parseInt(S.programStart.slice(8, 10), 10);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Axis//Reminders//EN",
    ev("axis-train", t + "T" + th + tm + "00", "FREQ=WEEKLY;BYDAY=" + trainDays, "Axis — today's session + daily tracks", "Open Axis. The session adapts to wherever you are."),
    ev("axis-rest", t + "T" + th + tm + "00", "FREQ=WEEKLY;BYDAY=" + restByday, "Axis — rest day (tracks still count)", "Recovery day. Pelvic floor, breath, mobility, meditation."),
    ev("axis-wind", t + "T" + wh + wm + "00", "FREQ=DAILY", "Axis — wind-down breath", "Box breathing + meditation. Protect the sleep that protects testosterone."),
    ev("axis-measure", t + "T09000" + "0", "FREQ=MONTHLY;BYMONTHDAY=" + md, "Axis — monthly re-measure", "BOLT, waist, benchmark. Two minutes of honesty."),
    "END:VCALENDAR"].join("\r\n");
}
function openReminderSheet() {
  showSheet(`
    <h3>Calendar reminders</h3>
    <div class="meta" style="margin-bottom:12px;">Axis can't send push notifications from a web app — but your calendar can. This exports a calendar file with recurring reminders: training days, the rest day, a nightly wind-down, and the monthly re-measure. Open the file and your phone adds them with normal alerts.</div>
    <div class="eq-row"><div class="eq-name">Training reminder</div><input type="time" id="rem-train" value="17:30" class="big-input num" style="width:140px; margin:0; padding:8px; font-size:1rem;"></div>
    <div class="eq-row"><div class="eq-name">Wind-down</div><input type="time" id="rem-wind" value="21:30" class="big-input num" style="width:140px; margin:0; padding:8px; font-size:1rem;"></div>
    <button class="btn primary" style="margin-top:14px;" id="rem-go">Export calendar file</button>
  `, sheet => {
    sheet.querySelector("#rem-go").onclick = () => {
      const ics = buildICS(sheet.querySelector("#rem-train").value || "17:30", sheet.querySelector("#rem-wind").value || "21:30");
      const blob = new Blob([ics], { type: "text/calendar" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "axis-reminders.ics";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      closeSheet(); toast("Calendar file exported — open it to add the reminders");
    };
  });
}

/* =====================================================================
   RENDERING
===================================================================== */
let currentTab = "today";
let moreView = "menu";   // menu | equip | recovery
let libCat = "all";
let lastScreenKey = null;
function render() {
  const scr = $("#screen");
  if (!S.onboarded) { scr.innerHTML = renderOnboarding(); bindOnboarding(); $("#tabbar").classList.add("hidden"); return; }
  $("#tabbar").classList.remove("hidden");
  // same screen re-rendering (e.g. toggling a control) keeps its scroll position
  // and skips the entry animation; only a real navigation resets to top
  const key = currentTab + "/" + moreView + "/" + (currentTab === "plan" ? planView : "") + "/" + (currentTab === "library" ? libCat : "");
  const samePage = key === lastScreenKey;
  const prevScroll = samePage ? scr.scrollTop : 0;
  if (currentTab === "today") scr.innerHTML = renderToday();
  else if (currentTab === "library") scr.innerHTML = renderLibrary();
  else if (currentTab === "progress") { scr.innerHTML = renderProgress(); drawAllCharts(); }
  else if (currentTab === "plan") scr.innerHTML = renderPlan();
  else if (currentTab === "more") {
    if (moreView === "equip") scr.innerHTML = renderEquipment();
    else if (moreView === "recovery") scr.innerHTML = renderRecovery();
    else scr.innerHTML = renderMoreMenu();
  }
  $$("#tabbar .tab").forEach(t => t.classList.toggle("active", t.dataset.tab === currentTab));
  scr.classList.toggle("anim", !samePage);
  scr.scrollTop = prevScroll;
  lastScreenKey = key;
}

/* ---------- brush motifs: one stroke per domain ---------- */
function motifSVG(kind, color) {
  const strokes = {
    pelvic:   `<path d="M18 34 Q50 78 82 34"/><path d="M32 30 Q50 52 68 30" opacity="0.45"/>`,                    // pelvic bowl cradle
    breath:   `<path d="M12 40 Q30 22 50 38 T88 36"/><path d="M20 58 Q38 44 56 56 T86 52" opacity="0.45"/>`,      // air currents
    mobility: `<path d="M26 82 Q22 30 64 18"/><path d="M64 18 Q76 14 84 22" opacity="0.45"/>`,                    // bowing reed
    mind:     `<circle cx="50" cy="50" r="30" stroke-dasharray="152 37" transform="rotate(-70 50 50)"/>`,         // small enso
    strength: `<path d="M14 74 L38 30 L54 56 L68 34 L86 74"/>`,                                                   // mountain ridge
    nutrition:`<path d="M50 82 Q24 60 34 34 Q54 26 64 40 Q72 62 50 82Z"/><path d="M50 78 Q48 56 58 40" opacity="0.5"/>`, // leaf
    torii:    `<path d="M14 34 Q50 22 86 34"/><path d="M28 32 V80"/><path d="M72 32 V80"/><path d="M22 50 H78" opacity="0.45"/>`, // torii gate
    core:     `<path d="M16 46 Q50 34 84 46"/><path d="M16 62 Q50 50 84 62" opacity="0.45"/><path d="M48 38 Q58 52 46 66"/>`,     // obi knot
    bolt:     `<path d="M58 12 L34 52 H52 L40 88"/>`,                                                             // lightning
    pulse:    `<path d="M10 54 H30 L42 28 L56 78 L66 46 H90"/>`,                                                  // heartbeat
    lotus:    `<path d="M50 24 Q60 42 50 60 Q40 42 50 24"/><path d="M26 40 Q32 58 50 62 Q34 60 22 50" opacity="0.6"/><path d="M74 40 Q68 58 50 62 Q66 60 78 50" opacity="0.6"/><path d="M18 64 Q34 76 50 74 Q66 76 82 64" opacity="0.4"/>`, // lotus
    paw:      `<ellipse cx="50" cy="62" rx="16" ry="13"/><circle cx="28" cy="42" r="7"/><circle cx="44" cy="34" r="7"/><circle cx="60" cy="35" r="7"/><circle cx="74" cy="45" r="7"/>`, // paw print
  };
  return `<svg class="motif" viewBox="0 0 100 100" aria-hidden="true" style="color:${color}">
    <g fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">${strokes[kind] || strokes.mind}</g>
  </svg>`;
}
const MOTIF_COLORS = { pelvic:"var(--c-pelvic)", breath:"var(--c-breath)", mobility:"var(--c-mobility)", mind:"var(--c-mind)", strength:"var(--c-strength)", nutrition:"var(--c-nutrition)" };

/* small brush icons — same single-stroke language as the motifs */
function brushIcon(kind, color) {
  const strokes = {
    gym:      `<path d="M22 50 H78"/><circle cx="20" cy="50" r="13"/><circle cx="80" cy="50" r="13"/><path d="M35 36 V64 M65 36 V64" opacity="0.5"/>`,           // barbell
    home:     `<path d="M16 52 Q50 20 84 52"/><path d="M28 52 V80 H72 V52" opacity="0.75"/><path d="M44 80 V62 H56 V80" opacity="0.45"/>`,                        // house
    travel:   `<rect x="26" y="38" width="48" height="42" rx="9" fill="none"/><path d="M40 38 V30 Q40 24 46 24 H54 Q60 24 60 30 V38" opacity="0.75"/>`,            // suitcase
    wave:     `<path d="M12 40 Q30 22 50 38 T88 36"/><path d="M20 60 Q38 44 56 56 T86 52" opacity="0.45"/>`,                                                       // air currents
    boxbreath:`<rect x="18" y="18" width="64" height="64" rx="18" fill="none" stroke-dasharray="200 36"/>`,                                                        // enso square
    walk:     `<path d="M26 84 Q52 66 40 46 Q30 28 62 18" stroke-dasharray="14 12"/><circle cx="72" cy="16" r="7"/>`,                                              // winding path
    stopwatch:`<circle cx="50" cy="56" r="30" stroke-dasharray="160 28" transform="rotate(-70 50 56)"/><path d="M50 56 V38" opacity="0.75"/><path d="M42 14 H58"/>`,// brush stopwatch
    complete: `<circle cx="50" cy="50" r="32" stroke-dasharray="185 16" transform="rotate(-64 50 50)"/><circle cx="50" cy="50" r="8" fill="currentColor" stroke="none"/>`, // closed enso
    alert:    `<path d="M50 18 Q54 44 51 60" stroke-width="9"/><circle cx="50" cy="80" r="6" fill="currentColor" stroke="none"/>`,                                 // brush exclamation
    bolt:     `<path d="M58 12 L34 52 H52 L40 88"/>`,                                                                                                              // lightning
  };
  return `<svg class="bicon" viewBox="0 0 100 100" aria-hidden="true" style="color:${color}">
    <g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">${strokes[kind] || strokes.complete}</g>
  </svg>`;
}

/* brush-flame streak mark (replaces the emoji) */
function flameSVG(color) {
  return `<svg class="flame" viewBox="0 0 100 100" aria-hidden="true" style="color:${color}">
    <path d="M50 12 C66 32 76 46 76 62 A26 26 0 1 1 24 62 C24 46 34 32 50 12 Z" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M50 46 C57 54 61 60 61 66 A11 11 0 1 1 39 66 C39 60 43 54 50 46 Z" fill="none" stroke="currentColor" stroke-width="5" opacity="0.55"/>
  </svg>`;
}
const PATTERN_MOTIF = {
  SQUAT:  ["strength","var(--c-strength)"], HINGE: ["strength","var(--c-amber)"], LUNGE: ["strength","var(--c-strength)"],
  CARRY:  ["strength","var(--c-amber)"],
  H_PUSH: ["torii","var(--c-mobility)"],    V_PUSH:["torii","var(--c-mobility)"],
  H_PULL: ["torii","var(--c-breath)"],      V_PULL:["torii","var(--c-breath)"],
  CORE:   ["core","var(--c-pelvic)"],
  PLYO:   ["bolt","var(--c-hiit)"],         REACTION:["bolt","var(--c-hiit)"],
  CARDIO: ["pulse","var(--c-hiit)"],
  FLOW:   ["paw","var(--c-nutrition)"],
};
const METRIC_MOTIF = {
  BOLT: ["breath","var(--c-breath)"], WAIST: ["mind","var(--c-strength)"], BODYWEIGHT: ["strength","var(--c-rest)"],
  LIFT_SQUAT: ["strength","var(--c-strength)"], LIFT_HINGE: ["strength","var(--c-amber)"],
  LIFT_PUSH: ["torii","var(--c-mobility)"], LIFT_PULL: ["torii","var(--c-breath)"],
  BENCHMARK: ["pulse","var(--c-nutrition)"],
};

/* ---------- Today ---------- */
function renderToday() {
  const tpl = todayTemplate();
  const week = programWeek();
  const dateStr = new Date().toLocaleDateString(undefined, { weekday:"long", month:"short", day:"numeric" });
  const tl = S.trackLogs[todayISO()] || {};
  const doneToday = S.workoutLogs.some(l => l.date === todayISO() && l.completed && l.templateId === tpl.id);
  const consec = consecutiveTrainingDays();
  const overtraining = consec >= 6 && tpl.type !== "REST";
  const deloadDue = !isDeload() && weeksSinceDeload() >= 5;

  const ensoColor = { strength:"var(--c-strength)", hiit:"var(--c-hiit)", breath:"var(--c-breath)", mobility:"var(--c-mobility)", rest:"var(--c-rest)" }[tpl.color] || "var(--c-strength)";
  const enso = `
    <svg class="enso" viewBox="0 0 100 100" aria-hidden="true" style="color:${ensoColor}">
      <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" stroke-width="5"
        stroke-linecap="round" stroke-dasharray="200 39" transform="rotate(-64 50 50)" opacity="0.85"/>
      <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-dasharray="30 209" transform="rotate(-80 50 50)" opacity="0.35"/>
    </svg>`;
  let sessionCard;
  if (tpl.type === "REST") {
    sessionCard = `
      <div class="hero rest">
        ${enso}
        <div class="eyebrow">Day ${programDay()+1} · Rest</div>
        <h2 class="hero-title">Rest day</h2>
        <div class="meta">${esc(tpl.desc)} Daily tracks below still count today.</div>
      </div>`;
  } else {
    sessionCard = `
      <div class="hero ${tpl.color}">
        ${enso}
        <div class="eyebrow">Day ${programDay()+1} · ${tpl.type}${isDeload() ? " · deload −40%" : ""}${isRampWeeks() ? " · week "+week+" ramp" : ""}</div>
        <h2 class="hero-title">${esc(tpl.label)}</h2>
        <div class="meta">${esc(tpl.desc)}</div>
        <div class="meta num" style="margin-top:6px;">${tpl.custom ? tpl.custom.exIds.length + " exercises · your own build" : tpl.slots.length + " movement slots · fills with what you have today"}</div>
        <button class="btn ${tpl.color}" data-act="open-session">${doneToday ? "✓ Completed — reopen" : "Start session"}</button>
      </div>`;
  }

  const gap = lastWorkoutGap();
  const comeback = gap != null && gap >= 4 && tpl.type !== "REST" && !doneToday && S.comebackDismissed !== todayISO();
  const comebackCard = comeback ? `
    <div class="card stripe nutrition">
      <h3>${gap} days away — and you're back</h3>
      <div class="meta">That's the whole game. Missed days are data, not failure; the plan absorbs them. Pick your re-entry:</div>
      <div class="btn-row" style="margin-top:12px;">
        <button class="btn nutrition sm" data-act="comeback-easy">Ease back in</button>
        <button class="btn ghost sm" data-act="comeback-full">Full session</button>
      </div>
      ${gap >= 14 ? `<button class="btn ghost sm" style="margin-top:8px;" data-act="comeback-restart">Restart at week 1 (recommended after 2+ weeks off)</button>` : ""}
    </div>` : "";
  const reviewCard = weekReviewDue() ? `
    <div class="card due-card tappable" data-act="open-review">
      <h3>${flameSVG("var(--c-mind)")} Weekly review ready</h3>
      <div class="meta">Sessions, minutes, volume, and track adherence — one honest minute.</div>
    </div>` : "";
  const warn = overtraining && !comeback ? `
    <div class="card warn-card">
      <h3>${brushIcon("alert","var(--c-hiit)")} ${consec} hard days in a row</h3>
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
      ${motifSVG(t.key, MOTIF_COLORS[t.key])}
      <div class="dot ${t.cls}"></div>
      <div>
        <div class="t-name">${t.name}</div>
        <div class="t-sub">${t.sub}</div>
        <div class="streak num" style="margin-top:6px; color:${MOTIF_COLORS[t.cls]};">${flameSVG(MOTIF_COLORS[t.cls])} ${t.streak}d</div>
      </div>
      <div class="t-check">✓</div>
    </button>`).join("") + `</div>`;

  const backupCard = backupDue() ? `
    <div class="card due-card tappable" data-act="goto-recovery">
      <h3>Backup due</h3>
      <div class="meta">${S.lastBackup ? "Last export " + S.lastBackup : "Never exported"} — browsers can evict app storage. One tap in Recovery.</div>
    </div>` : "";

  const dueMetrics = Object.keys(METRIC_DEFS).filter(t => ["BOLT","WAIST","BENCHMARK"].includes(t) && metricDue(t));
  const dueCard = dueMetrics.length && !isRampWeeks() ? `
    <div class="card due-card tappable" data-act="goto-progress">
      <h3>Re-measure due</h3>
      <div class="meta">${dueMetrics.map(t => METRIC_DEFS[t].label).join(" · ")} — monthly check-in. Tap to log.</div>
    </div>` : "";

  return `
    <div class="hdr"><h1>Axis</h1><span class="date">${esc(dateStr)}</span></div>
    <div class="sub num"><span style="color:var(--c-strength); font-weight:700;">Week ${week} · Day ${programDay()+1} of 7</span><span style="color:var(--text-3);"> · </span><span style="color:var(--c-mind); font-weight:700;">${flameSVG("var(--c-mind)")} ${workoutStreak()}-day streak</span></div>
    ${comebackCard}${reviewCard}${warn}${deloadCard}
    ${sessionCard}
    <div class="sec">Daily tracks — the floor</div>
    ${trackGrid}
    ${dueCard}
    ${backupCard}
    <div class="sec">Quick timers</div>
    <div class="btn-row">
      <button class="btn ghost sm" data-act="open-hiit-timer">HIIT timer</button>
      <button class="btn ghost sm" data-act="open-box">Box breath</button>
      <button class="btn ghost sm" data-act="open-bolt">BOLT test</button>
    </div>`;
}

/* ---------- Library ---------- */
function libLastDone(exId) {
  for (let i = S.workoutLogs.length - 1; i >= 0; i--) {
    const log = S.workoutLogs[i];
    const ent = (log.entries || []).find(e => e.exId === exId && e.sets.some(s => s.done));
    if (ent) {
      const done = ent.sets.filter(s => s.done);
      const loads = done.map(s => s.load).filter(Boolean);
      return { date: log.date, txt: done.length + "×" + (done[0].reps ?? "—") + (loads.length ? " · " + loads[loads.length - 1] : "") };
    }
  }
  return null;
}
function renderLibrary() {
  const owned = S.equipment.filter(e => e !== "gym");
  const cats = [{ id:"all", label:"All" }].concat(CATEGORIES);
  const chipRow = `<div class="cat-row">` + cats.map(c =>
    `<button class="cat-chip ${libCat === c.id ? "on" : ""}" data-act="lib-cat" data-cat="${c.id}">${esc(c.label)}</button>`).join("") + `</div>`;

  const activeCats = libCat === "all" ? CATEGORIES : CATEGORIES.filter(c => c.id === libCat);
  let body = "";
  for (const cat of activeCats) {
    body += `<div class="sec">${esc(cat.label)}</div>`;
    if (cat.practice) {
      body += PRACTICES.filter(p => p.cat === cat.id).map(p => `
        <button class="ex-card practice-card stripe ${p.color}" data-act="open-practice" data-open="${p.open}">
          ${motifSVG(p.motif || p.color, MOTIF_COLORS[p.color])}
          <div><div class="ex-title">${esc(p.name)}</div><div class="ex-sub">${esc(p.sub)}</div></div>
          <div class="ex-side"><span class="chip ${p.color} on">guided</span></div>
        </button>`).join("");
      continue;
    }
    const exs = EXERCISES.filter(e => cat.patterns.includes(e.pattern)).sort((a, b) => b.priority - a.priority);
    body += exs.map(ex => {
      const missing = ex.req.filter(r => r !== "gym" && !owned.includes(r));
      const gymOnly = ex.req.includes("gym");
      const locked = missing.length > 0;
      const last = libLastDone(ex.id);
      const eqTxt = ex.req.length ? ex.req.map(r => (EQUIPMENT.find(q => q.id === r) || { name: r }).name).join(" · ") : "Bodyweight";
      const pm = PATTERN_MOTIF[ex.pattern];
      return `
        <button class="ex-card ${locked ? "locked" : ""}" data-act="ex-detail" data-ex="${ex.id}">
          ${pm ? motifSVG(pm[0], pm[1]) : ""}
          <div>
            <div class="ex-title">${esc(ex.name)}</div>
            <div class="ex-sub">${esc(eqTxt)}${locked ? " · not owned yet" : gymOnly ? " · gym day" : ""}</div>
          </div>
          <div class="ex-side">
            <span class="tag ${ex.pattern}">${esc(PATTERN_LABEL[ex.pattern])}</span>
            ${last ? `<div class="ex-last num" style="margin-top:5px;">${esc(last.txt)}</div>` : ""}
          </div>
        </button>`;
    }).join("");
  }
  return `
    <div class="hdr"><h1>Library</h1></div>
    <div class="sub">Every movement by name. Tap one for its form cue, ladder, and a one-off session.</div>
    ${chipRow}${body}`;
}

function openExerciseSheet(exId) {
  const ex = EXERCISES.find(e => e.id === exId);
  if (!ex) return;
  const owned = S.equipment.filter(e => e !== "gym");
  const missing = ex.req.filter(r => r !== "gym" && !owned.includes(r));
  const gymOnly = ex.req.includes("gym");
  const last = libLastDone(ex.id);
  const eqTxt = ex.req.length ? ex.req.map(r => (EQUIPMENT.find(q => q.id === r) || { name: r }).name).join(", ") : "Bodyweight — always available";
  const info = EX_INFO[ex.id] || {};
  showSheet(`
    <span class="tag ${ex.pattern}">${esc(PATTERN_LABEL[ex.pattern])}</span>
    <h3 style="margin-top:12px;">${esc(ex.name)}</h3>
    ${stickAnimFor(ex) ? `<canvas class="demo-canvas" id="ex-demo" width="340" height="200" aria-label="movement demo"></canvas>` : ""}
    ${info.desc ? `<div class="meta" style="margin-bottom:12px; line-height:1.6;">${esc(info.desc)}</div>` : ""}
    ${info.primary ? `
      <div class="muscle-row"><span class="m-label">Primary</span>${info.primary.map(m => `<span class="chip m-chip">${esc(m)}</span>`).join("")}</div>` : ""}
    ${info.secondary ? `
      <div class="muscle-row"><span class="m-label">Secondary</span>${info.secondary.map(m => `<span class="chip m-chip dim">${esc(m)}</span>`).join("")}</div>` : ""}
    ${ex.cue ? `<div class="eq-row" style="border-top:1px solid var(--line); margin-top:12px;"><div><div class="eq-name">Form</div><div class="eq-unlocks">${esc(ex.cue)}</div></div></div>` : ""}
    <div class="eq-row"><div><div class="eq-name">Needs</div><div class="eq-unlocks">${esc(eqTxt)}</div></div></div>
    ${ex.ladder ? `<div class="eq-row"><div><div class="eq-name">Progression ladder</div><div class="eq-unlocks">${ex.ladder.map(esc).join(" → ")}</div></div></div>` : ""}
    ${last ? `<div class="eq-row"><div><div class="eq-name">Last done</div><div class="eq-unlocks num">${esc(last.txt)} · ${last.date}</div></div></div>` : ""}
    <div style="height:10px;"></div>
    ${missing.length
      ? `<button class="btn ghost">Locked — needs ${missing.map(m => esc((EQUIPMENT.find(q => q.id === m) || { name: m }).name)).join(", ")}</button>`
      : `<button class="btn strength" data-start-single="${ex.id}">Do this now${gymOnly ? " · at the gym" : ""}</button>`}
  `, sheet => {
    const cv = sheet.querySelector("#ex-demo");
    const anim = stickAnimFor(ex);
    if (cv && anim) startStickAnim(cv, anim);
    const b = sheet.querySelector("[data-start-single]");
    if (b) b.onclick = () => { closeSheet(); startSingleExercise(b.dataset.startSingle); };
  });
}

function startSingleExercise(exId) {
  const ex = EXERCISES.find(e => e.id === exId);
  if (!ex) return;
  const location = ex.req.includes("gym") ? "gym" : "home";
  const rx = ex.pattern === "FLOW"
    ? { sets: 3, repLo: 30, repHi: 60, rest: 60, unit: "s" }
    : ex.power
    ? { sets: 4, repLo: 3, repHi: 5, rest: 120 }
    : { sets: 3, repLo: 8, repHi: 12, rest: 90 };
  const slot = { pattern: ex.pattern, target: PATTERN_LABEL[ex.pattern], rx };
  const templateId = "single_" + ex.id;
  const existing = S.workoutLogs.find(l => l.date === todayISO() && l.templateId === templateId);
  const prior = existing ? (existing.entries || []).find(en => en.exId === ex.id) : null;
  session = {
    templateId, location,
    avail: availableEquipment(location),
    tpl: { id: templateId, label: ex.name, color: "strength", type: "SINGLE" },
    slots: [{ slot, ex, sets: prior ? prior.sets : Array.from({ length: rx.sets }, () => ({ reps: null, load: "", done: false })) }],
  };
  renderSession();
}

function openPractice(key) {
  if (key === "pelvic") openPelvic();
  else if (key === "sex_yoga") openYogaFlow();
  else if (key === "aerobic40") openAerobicDose();
  else if (key === "coherence") openCoherence("coherence");
  else if (key === "box") openBoxBreathing();
  else if (key === "holds") openBreathHold();
  else if (key === "bolt") openBolt();
  else if (key === "mob_dynamic") openMobilityPlayer("dynamic");
  else if (key === "mob_static") openMobilityPlayer("static");
  else if (key === "meditation") openCoherence("meditation");
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
    const mm = METRIC_MOTIF[t];
    return `
      <div class="card chart-card ${due ? "due-card" : ""}">
        ${mm ? motifSVG(mm[0], mm[1]) : ""}
        <div class="metric-head">
          <div><h3>${def.label}${due ? " · due" : ""}</h3>${def.note ? `<div class="meta">${def.note}</div>` : ""}</div>
          <div style="text-align:right;"><div class="val num">${latest ? latest.value + " " + def.unit : "—"}</div>${deltaHtml}</div>
        </div>
        ${series.length > 1 ? `<canvas data-chart="${t}" width="600" height="300"></canvas>` : `<div class="info-note">Log at least two entries to see the trend.</div>`}
        <button class="btn sm tint" style="--tint:${def.color}; margin-top:10px;" data-act="log-metric" data-type="${t}">＋ Log ${def.label.toLowerCase()}</button>
      </div>`;
  }).join("");
  const deloadIn = Math.max(0, 5 - weeksSinceDeload());
  // training-time totals from logged session durations
  const isoDaysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  const minsBetween = (fromISO, toISO) => Math.round(S.workoutLogs
    .filter(l => l.completed && l.durationSecs && l.date >= fromISO && l.date <= toISO)
    .reduce((a, l) => a + l.durationSecs, 0) / 60);
  const todayMin = minsBetween(todayISO(), todayISO());
  const thisWk = minsBetween(isoDaysAgo(6), todayISO());
  const lastWk = minsBetween(isoDaysAgo(13), isoDaysAgo(7));
  const wkDelta = thisWk - lastWk;
  const wkTrend = lastWk === 0 ? ["", "var(--text-2)", "first week of time data — keep logging"] :
    wkDelta > 10 ? ["↑", "var(--c-nutrition)", `+${wkDelta} min vs last week — building`] :
    wkDelta < -10 ? ["↓", "var(--c-hiit)", `${wkDelta} min vs last week — lighter week`] :
    ["≈", "var(--text-2)", "level with last week — steady"];
  const timeCard = `
    <div class="card stripe strength">
      <h3>Training time</h3>
      <div class="metric-head" style="margin-top:8px;">
        <div><div class="meta">Today</div><div class="val num" style="font-size:1.25rem;">${todayMin} min</div></div>
        <div><div class="meta">Last 7 days</div><div class="val num" style="font-size:1.25rem;">${thisWk} min</div></div>
        <div><div class="meta">Prior 7</div><div class="val num" style="font-size:1.25rem; color:var(--text-2);">${lastWk} min</div></div>
      </div>
      <div class="meta" style="color:${wkTrend[1]}; font-weight:700;">${wkTrend[0]} ${wkTrend[2]}</div>
    </div>`;
  return `
    <div class="hdr"><h1>Progress</h1></div>
    <div class="sub">Sexual stamina, breath, and mobility move on an <b>8–12 week</b> horizon. Judge trends, not days.</div>
    ${timeCard}
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
    // faint grid — read theme colors live so light mode charts stay legible
    const rootCss = getComputedStyle(document.documentElement);
    const gridColor = rootCss.getPropertyValue("--line").trim() || "#26262A";
    const bgColor = rootCss.getPropertyValue("--bg").trim() || "#0A0A0B";
    ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
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
    ctx.strokeStyle = bgColor; ctx.lineWidth = 3; ctx.stroke();
  });
}

/* ---------- Plan ---------- */
let planView = "week"; // day | week | month
function renderPlan() {
  const seg = `
    <div class="cat-row" style="margin-bottom:6px;">
      ${["day","week","month"].map(v => `<button class="cat-chip ${planView === v ? "on" : ""}" data-act="plan-view" data-view="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join("")}
    </div>`;
  const myWorkouts = (S.customWorkouts || []).map(w => `
    <div class="card stripe hiit">
      <div class="card-row">
        <div style="flex:1">
          <h3>${esc(w.name)}</h3>
          <div class="meta">${WORKOUT_MODES[w.mode].label} · ${customSummary(w)} · ${w.exIds.length} exercise${w.exIds.length === 1 ? "" : "s"}</div>
        </div>
        <button class="swap-btn" data-act="del-custom" data-id="${w.id}">Delete</button>
      </div>
      <button class="btn hiit sm" style="margin-top:12px;" data-act="run-custom" data-id="${w.id}">Run</button>
    </div>`).join("");
  const workoutsSection = `
    <div class="sec">My workouts</div>
    ${myWorkouts || `<div class="card"><div class="info-note">Nothing built yet. Pick your exercises, choose a timer (HIIT, Tabata, EMOM, AMRAP, rounds, or plain sets), and the pairing brain will suggest what complements what.</div></div>`}
    <button class="btn primary" data-act="open-builder">＋ Build a workout</button>
    <div style="height:8px;"></div>`;
  const body = planView === "day" ? renderPlanDay() : planView === "month" ? renderPlanMonth() : renderPlanWeek();
  return `
    <div class="hdr"><h1>Plan</h1></div>
    ${seg}${body}${workoutsSection}`;
}

function renderPlanWeek() {
  const ramp = isRampWeeks();
  const rows = effectiveWeekOrder().map((tid, i) => {
    const todayPin = (i === programDay() && S.todayOverride && S.todayOverride.date === todayISO())
      ? (S.customWorkouts || []).find(x => x.id === S.todayOverride.id) : null;
    const ow = todayPin || activeDayOverride(i);
    const t = ow ? customAsTemplate(ow) : TEMPLATES[tid];
    const isGymDay = S.gymDays.includes(i);
    return `
      <div class="week-row">
        <div class="day-l num">Day ${i+1}${programDay()===i ? " ●" : ""}</div>
        <div style="flex:1">
          <div class="day-name"><span class="dot ${t.color}" style="display:inline-block; margin-right:6px;"></span>${esc(t.label)}${ow ? ` <span class="chip hiit on" style="font-size:0.54rem; padding:2px 7px;">${todayPin ? "today only" : "custom"}</span>` : ""}</div>
          <div class="day-sub">${esc(t.desc)}</div>
        </div>
        ${ow ? `<button class="swap-btn" data-act="clear-override" data-day="${i}" data-kind="${todayPin ? "today" : "day"}">✕</button>`
             : t.type !== "REST" ? `<button class="gym-toggle num ${isGymDay ? "on" : ""}" data-act="toggle-gym" data-day="${i}">${isGymDay ? "GYM" : "HOME"}</button>` : ""}
      </div>`;
  }).join("");
  return `
    <div class="sub">Mark which days the gym is likely. Heavy strength days should land on gym days — but every session has a full home fallback, so nothing blocks you.</div>
    ${isRampWeeks() ? `<div class="card due-card"><h3>Weeks 1–2 ramp</h3><div class="meta">You're on the ramp week: 3 form-focused strength days, 1 HIIT, light days between. The full 6-day split takes over in week 3.</div></div>` : ""}
    <div class="card">${rows}</div>
    <div class="card">
      <h3>Scheduler rules</h3>
      <div class="info-note">· 6 days on, 1 off — the rest day is protected.<br>· Two heavy strength days are never stacked back-to-back.<br>· Any session is completable with band + bodyweight; gym just raises the ceiling.</div>
      <button class="btn ghost sm" style="margin-top:12px;" data-act="auto-schedule">Re-balance week around my gym days</button>
    </div>`;
}

function renderPlanDay() {
  const tpl = todayTemplate();
  const isGymDay = S.gymDays.includes(programDay());
  const doneToday = S.workoutLogs.some(l => l.date === todayISO() && l.completed && l.templateId === tpl.id);
  let slotRows = "";
  if (tpl.custom) {
    slotRows = tpl.custom.exIds.map(id => {
      const ex = EXERCISES.find(e => e.id === id);
      return ex ? `<div class="eq-row"><div><div class="eq-name">${esc(ex.name)}</div><div class="eq-unlocks">${PATTERN_LABEL[ex.pattern]}</div></div><span class="tag ${ex.pattern}">${PATTERN_LABEL[ex.pattern]}</span></div>` : "";
    }).join("");
  } else if (tpl.slots.length) {
    const avail = availableEquipment(isGymDay ? "gym" : "home");
    slotRows = tpl.slots.filter(s => !(s.week3 && isRampWeeks())).map(slot => {
      const ex = ["MOBILITY","BREATH_HOLD"].includes(slot.pattern) ? null : pickExercise(slot.pattern, avail);
      const rx = slot.rx;
      return `
        <div class="eq-row">
          <div><div class="eq-name">${ex ? esc(ex.name) : esc(slot.target)}</div>
          <div class="eq-unlocks">${esc(slot.target)} · ${rx.sets}×${rx.repLo}–${rx.repHi}${rx.unit === "s" ? " s" : rx.unit === "min" ? " min" : ""}</div></div>
          <span class="tag ${slot.pattern}">${PATTERN_LABEL[slot.pattern] || slot.pattern}</span>
        </div>`;
    }).join("");
  }
  const tl = S.trackLogs[todayISO()] || {};
  const trackLine = ["pelvic","breath","mobility","mind"].map(k => `${tl[k] ? "✓" : "·"} ${k === "mind" ? "meditation" : k === "pelvic" ? "pelvic floor" : k}`).join("   ");
  return `
    <div class="sub">What today holds, exercise by exercise${tpl.custom ? "" : " — resolved for " + (isGymDay ? "the gym" : "home") + " gear"}.</div>
    <div class="card stripe ${tpl.color}">
      <div class="chip ${tpl.color} on">Day ${programDay()+1} · ${tpl.type}</div>
      <h3 style="margin-top:8px;">${esc(tpl.label)}${doneToday ? " ✓" : ""}</h3>
      <div class="meta">${esc(tpl.desc)}</div>
      ${slotRows ? `<div style="margin-top:8px;">${slotRows}</div>` : `<div class="info-note">Full rest. The daily tracks below still count.</div>`}
      ${tpl.type !== "REST" ? `<button class="btn ${tpl.color}" style="margin-top:14px;" data-act="open-session">${doneToday ? "✓ Completed — reopen" : "Start session"}</button>` : ""}
    </div>
    <div class="card"><h3>Daily tracks</h3><div class="meta num" style="letter-spacing:0.02em;">${trackLine}</div></div>`;
}

function renderPlanMonth() {
  const start = new Date(); start.setDate(start.getDate() - programDay());
  const doneDates = new Set(S.workoutLogs.filter(l => l.completed).map(l => l.date));
  const curWeek = programWeek();
  let rows = "";
  for (let r = 0; r < 4; r++) {
    let cells = "";
    for (let c = 0; c < 7; c++) {
      const d = new Date(start); d.setDate(start.getDate() + r * 7 + c);
      const iso = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
      const weekN = curWeek + r;
      const order = weekN <= 2 ? WEEK_RAMP : S.weekOrder;
      const ow = activeDayOverride(c);
      const t = (r === 0 && ow) ? customAsTemplate(ow) : TEMPLATES[order[c]];
      const isToday = iso === todayISO();
      const done = doneDates.has(iso);
      cells += `
        <div class="mcell ${isToday ? "today" : ""} ${iso < todayISO() && !done && t.type !== "REST" ? "missed" : ""}">
          <div class="mnum num">${d.getDate()}</div>
          <div class="dot ${t.color}" style="margin:3px auto 0;"></div>
          <div class="mdone">${done ? "✓" : ""}</div>
        </div>`;
    }
    const deloadFlag = (curWeek + r) % 6 === 5;
    rows += `<div class="mweek"><div class="mweek-label num">W${curWeek + r}${deloadFlag ? " ·deload?" : ""}</div><div class="mgrid">${cells}</div></div>`;
  }
  return `
    <div class="sub">The next four weeks at a glance. Dots show the session type; ✓ marks completed days.</div>
    <div class="card">${rows}</div>
    <div class="card"><div class="meta">
      <span class="dot strength" style="display:inline-block;"></span> strength &nbsp;
      <span class="dot hiit" style="display:inline-block;"></span> conditioning &nbsp;
      <span class="dot breath" style="display:inline-block;"></span> zone-2 &nbsp;
      <span class="dot mobility" style="display:inline-block;"></span> light &nbsp;
      <span class="dot rest" style="display:inline-block;"></span> rest
    </div></div>`;
}

/* ---------- custom workout builder ---------- */
function customSummary(w) {
  const c = w.cfg;
  if (w.mode === "sets") return `${c.sets}×${c.repLo}–${c.repHi}, rest ${c.rest}s`;
  if (w.mode === "hiit" || w.mode === "tabata") return `${c.work}s/${c.rest}s × ${c.rounds}`;
  if (w.mode === "emom") return `${c.minutes} min`;
  if (w.mode === "amrap") return `${c.minutes} min cap`;
  if (w.mode === "rounds") return `${c.rounds} rounds, rest ${c.rest}s`;
  return "free timing";
}

const CFG_META = {
  sets:   ["Sets", 1, 1, 10],
  repLo:  ["Rep min", 1, 1, 30],
  repHi:  ["Rep max", 1, 1, 50],
  rest:   ["Rest (s)", 15, 10, 300],
  work:   ["Work (s)", 5, 10, 180],
  rounds: ["Rounds", 1, 1, 20],
  minutes:["Minutes", 1, 3, 60],
};

let builder = null;
function openBuilder() {
  builder = { name: "", mode: "sets", cfg: { ...WORKOUT_MODES.sets.cfg }, exIds: [], place: { type: "list", day: 0, perpetual: true } };
  renderBuilder();
}

/* pairing brain: complement the last pick's pattern, skip patterns already covered */
function pairSuggestions() {
  const ownedSet = new Set(S.equipment.filter(x => x !== "gym"));
  const chosen = builder.exIds.map(id => EXERCISES.find(e => e.id === id)).filter(Boolean);
  const covered = new Set(chosen.map(e => e.pattern));
  let targets = [];
  if (!chosen.length) targets = ["SQUAT", "H_PUSH", "H_PULL"]; // a balanced opening
  else {
    for (let i = chosen.length - 1; i >= 0 && targets.length < 3; i--) {
      (PATTERN_PAIRS[chosen[i].pattern] || []).forEach(p => {
        if (!covered.has(p) && !targets.includes(p)) targets.push(p);
      });
    }
  }
  const out = [];
  for (const p of targets.slice(0, 3)) {
    const pick = EXERCISES
      .filter(e => e.pattern === p && !builder.exIds.includes(e.id) && e.req.every(r => r === "gym" || ownedSet.has(r)))
      .sort((a, b) => (b.priority - (b.req.includes("gym") ? 60 : 0)) - (a.priority - (a.req.includes("gym") ? 60 : 0)))[0];
    if (pick) out.push({ ex: pick, why: PATTERN_LABEL[p].toLowerCase() });
  }
  return out;
}

function builderCfgUI() {
  const keys = Object.keys(builder.cfg);
  if (!keys.length) return "";
  return `<div class="card">` + keys.map(k => {
    const [label, step] = CFG_META[k] || [k, 1];
    return `
      <div class="eq-row">
        <div class="eq-name">${label}</div>
        <div class="stepper" style="margin:0;">
          <button data-b="st" data-key="${k}" data-d="-${step}">−</button>
          <div class="stv num" style="min-width:64px; font-size:1.15rem;">${builder.cfg[k]}</div>
          <button data-b="st" data-key="${k}" data-d="${step}">+</button>
        </div>
      </div>`;
  }).join("") + `</div>`;
}

function renderBuilder() {
  const ov = getOverlay();
  const exList = builder.exIds.map((id, i) => {
    const ex = EXERCISES.find(e => e.id === id);
    return `
      <div class="eq-row">
        <div><div class="eq-name">${i + 1}. ${esc(ex.name)}</div><div class="eq-unlocks">${PATTERN_LABEL[ex.pattern]}</div></div>
        <button class="swap-btn" data-b="rm" data-id="${id}">✕</button>
      </div>`;
  }).join("");
  const sugg = pairSuggestions();
  ov.innerHTML = `
    <div class="overlay-hdr"><h2>Build a workout</h2><button class="x-btn" data-b="close">✕</button></div>
    <input class="big-input" id="bw-name" placeholder="Name it — e.g. Hotel-room burner" value="${esc(builder.name)}" style="text-align:left; font-size:1.05rem; font-weight:600;">
    <div class="sec">Timer</div>
    <div class="cat-row wrap">${Object.entries(WORKOUT_MODES).map(([k, v]) =>
      `<button class="cat-chip ${builder.mode === k ? "on" : ""}" data-b="mode" data-mode="${k}">${v.label}</button>`).join("")}</div>
    <div class="meta" style="margin:0 2px 10px;">${WORKOUT_MODES[builder.mode].hint}</div>
    ${builderCfgUI()}
    <div class="sec">Exercises · ${builder.exIds.length}</div>
    <div class="card">${exList || `<div class="info-note">Nothing yet. Start anywhere — the suggestions below keep the workout balanced.</div>`}</div>
    ${sugg.length ? `
      <div class="sec">Pairs well</div>
      <div class="cat-row wrap">${sugg.map(s => `<button class="cat-chip" data-b="add" data-id="${s.ex.id}">＋ ${esc(s.ex.name)} · ${s.why}</button>`).join("")}</div>` : ""}
    <button class="btn ghost" data-b="pick">Browse all exercises</button>
    <div class="sec">Where it lives</div>
    <div class="cat-row wrap">
      <button class="cat-chip ${builder.place.type === "list" ? "on" : ""}" data-b="place" data-place="list">Just save it</button>
      <button class="cat-chip ${builder.place.type === "today" ? "on" : ""}" data-b="place" data-place="today">Today's workout</button>
      <button class="cat-chip ${builder.place.type === "day" ? "on" : ""}" data-b="place" data-place="day">Replace a weekly day</button>
    </div>
    ${builder.place.type === "day" ? `
      <div class="cat-row wrap">${effectiveWeekOrder().map((tid, i) => tid === "rest" ? "" :
        `<button class="cat-chip ${builder.place.day === i ? "on" : ""}" data-b="pday" data-day="${i}">D${i+1} · ${esc(TEMPLATES[tid].label.split(" ")[0])}</button>`).join("")}</div>
      <div class="cat-row wrap">
        <button class="cat-chip ${builder.place.perpetual ? "on" : ""}" data-b="perp" data-v="1">Every week</button>
        <button class="cat-chip ${!builder.place.perpetual ? "on" : ""}" data-b="perp" data-v="0">This week only</button>
      </div>` : ""}
    ${builder.place.type === "today" ? `<div class="meta" style="margin:0 2px 8px;">Shows as the hero on Today for the rest of the day, then the normal plan resumes.</div>` : ""}
    <button class="btn primary" style="margin-top:10px;" data-b="save">Save workout</button>
    <div style="height:70px;"></div>`;
  ov.oninput = e => { if (e.target.id === "bw-name") builder.name = e.target.value; };
  ov.onclick = e => {
    const b = e.target.closest("[data-b]"); if (!b) return;
    const k = b.dataset.b;
    if (k === "close") { closeOverlay(); render(); }
    if (k === "mode") { builder.mode = b.dataset.mode; builder.cfg = { ...WORKOUT_MODES[builder.mode].cfg }; renderBuilder(); }
    if (k === "st") {
      const key = b.dataset.key, [, , lo, hi] = CFG_META[key] || [0, 0, 1, 999];
      builder.cfg[key] = Math.min(hi, Math.max(lo, builder.cfg[key] + parseFloat(b.dataset.d)));
      if (key === "repLo") builder.cfg.repHi = Math.max(builder.cfg.repHi || 0, builder.cfg.repLo);
      renderBuilder();
    }
    if (k === "rm") { builder.exIds = builder.exIds.filter(x => x !== b.dataset.id); renderBuilder(); }
    if (k === "add") { builder.exIds.push(b.dataset.id); renderBuilder(); }
    if (k === "pick") openBuilderPicker();
    if (k === "place") { builder.place.type = b.dataset.place; renderBuilder(); }
    if (k === "pday") { builder.place.day = parseInt(b.dataset.day); renderBuilder(); }
    if (k === "perp") { builder.place.perpetual = b.dataset.v === "1"; renderBuilder(); }
    if (k === "save") {
      if (!builder.exIds.length) { toast("Add at least one exercise"); return; }
      const w = { id: Date.now().toString(36), name: builder.name.trim() || "My workout", mode: builder.mode, cfg: builder.cfg, exIds: builder.exIds };
      S.customWorkouts.push(w);
      let msg = `"${w.name}" saved — it lives in Plan`;
      if (builder.place.type === "today") {
        S.todayOverride = { id: w.id, date: todayISO() };
        msg = `"${w.name}" is today's workout`;
      } else if (builder.place.type === "day") {
        let until = null;
        if (!builder.place.perpetual) {
          const d = new Date(); d.setDate(d.getDate() - programDay() + builder.place.day);
          if (d < new Date(todayISO())) d.setDate(d.getDate() + 7);
          until = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
        }
        S.dayOverrides = S.dayOverrides || {};
        S.dayOverrides[builder.place.day] = { id: w.id, until };
        msg = `"${w.name}" now replaces Day ${builder.place.day + 1}${until ? " this week" : " every week"}`;
      }
      save();
      closeOverlay(); currentTab = builder.place.type === "today" ? "today" : "plan"; render();
      toast(msg);
    }
  };
}

function openBuilderPicker() {
  const ownedSet = new Set(S.equipment.filter(x => x !== "gym"));
  const body = CATEGORIES.filter(c => c.patterns).map(cat => {
    const exs = EXERCISES.filter(e => cat.patterns.includes(e.pattern) && e.req.every(r => r === "gym" || ownedSet.has(r)))
      .sort((a, b) => b.priority - a.priority);
    if (!exs.length) return "";
    return `<div class="sec">${esc(cat.label)}</div>` + exs.map(ex => `
      <button class="opt-row ${builder.exIds.includes(ex.id) ? "sel" : ""}" data-pick="${ex.id}">
        <span>${esc(ex.name)}<span class="o-sub">${PATTERN_LABEL[ex.pattern]}${ex.req.includes("gym") ? " · gym" : ""}</span></span>
        <span style="margin-left:auto;">${builder.exIds.includes(ex.id) ? "✓" : "＋"}</span>
      </button>`).join("");
  }).join("");
  showSheet(`<h3>Add exercises</h3>${body}<div style="height:8px;"></div><button class="btn primary" id="pick-done">Done</button>`, sheet => {
    sheet.onclick = e => {
      if (e.target.closest("#pick-done")) { closeSheet(); renderBuilder(); return; }
      const b = e.target.closest("[data-pick]"); if (!b) return;
      const id = b.dataset.pick;
      if (builder.exIds.includes(id)) { builder.exIds = builder.exIds.filter(x => x !== id); b.classList.remove("sel"); b.lastElementChild.textContent = "＋"; }
      else { builder.exIds.push(id); b.classList.add("sel"); b.lastElementChild.textContent = "✓"; }
    };
  });
}

/* ---------- custom workout runner ---------- */
function runCustom(id) {
  const w = (S.customWorkouts || []).find(x => x.id === id); if (!w) return;
  if (w.mode === "sets") {
    const location = w.exIds.some(x => (EXERCISES.find(e => e.id === x) || { req: [] }).req.includes("gym")) ? "gym" : "home";
    const templateId = "custom_" + w.id;
    const existing = S.workoutLogs.find(l => l.date === todayISO() && l.templateId === templateId);
    session = {
      templateId, location, avail: availableEquipment(location),
      tpl: { id: templateId, label: w.name, color: "hiit", type: "CUSTOM" },
      slots: w.exIds.map(exId => {
        const ex = EXERCISES.find(e => e.id === exId);
        const prior = existing ? (existing.entries || []).find(en => en.exId === exId) : null;
        return { slot: { pattern: ex.pattern, target: PATTERN_LABEL[ex.pattern], rx: { sets: w.cfg.sets, repLo: w.cfg.repLo, repHi: w.cfg.repHi, rest: w.cfg.rest } }, ex,
          sets: prior ? prior.sets : Array.from({ length: w.cfg.sets }, () => ({ reps: null, load: "", done: false })) };
      }),
    };
    renderSession();
    return;
  }
  openConductor(w);
}

function finishCustom(w, rounds, durationSecs) {
  S.workoutLogs.push({
    date: todayISO(), templateId: "custom_" + w.id, location: "home",
    entries: w.exIds.map(id => ({ exId: id, sets: [{ reps: null, load: "", done: true }] })),
    completed: true, durationSecs: durationSecs || 0,
  });
  save(); beepDone(); closeOverlay(); render();
  toast(`${w.name} logged${rounds ? " · " + rounds + " rounds" : ""} · ${workoutStreak()}-day streak`);
}

function openConductor(w) {
  const exs = w.exIds.map(id => EXERCISES.find(e => e.id === id)).filter(Boolean);
  const mode = w.mode, cfg = w.cfg;
  const listHtml = exs.map((ex, i) => `
    <div class="eq-row"><div><div class="eq-name">${i + 1}. ${esc(ex.name)}</div><div class="eq-unlocks">${esc(ex.cue || "")}</div></div></div>`).join("");
  const hasLap = mode === "amrap" || mode === "rounds";
  const initClock = (mode === "emom" || mode === "amrap") ? fmtClock(cfg.minutes * 60) : (mode === "hiit" || mode === "tabata") ? "0:10" : "0:00";
  overlayShell(esc(w.name), "hiit", `
    <div class="big-timer" style="min-height:300px;">
      <div class="phase hiit-prep" id="cd-phase">${WORKOUT_MODES[mode].label}</div>
      <div class="clock num" id="cd-clock">${initClock}</div>
      <div class="round num" id="cd-round">&nbsp;</div>
      <div class="btn-row" style="max-width:360px; width:100%;">
        <button class="btn hiit" id="cd-start">Start</button>
        ${hasLap ? `<button class="btn ghost" id="cd-lap">Round ✓</button>` : ""}
      </div>
      <button class="btn ghost sm" id="cd-finish">Finish & log</button>
    </div>
    <div class="sec">The work${mode === "emom" ? " — one exercise per minute, rotating" : mode === "amrap" || mode === "rounds" ? " — one full circuit = one round" : ""}</div>
    <div class="card">${listHtml}</div>
    <div style="height:40px;"></div>`);
  let int = null, running = false, t0 = 0, pausedAt = 0, rounds = 0, lastMark = -1, restUntil = 0, done = false;
  overlayCleanup = () => clearInterval(int);
  const phaseEl = $("#cd-phase"), clockEl = $("#cd-clock"), roundEl = $("#cd-round"), startBtn = $("#cd-start");
  // interval schedule for hiit/tabata
  const sched = [];
  if (mode === "hiit" || mode === "tabata") {
    sched.push({ p: "prep", d: 10, r: 1 });
    for (let r = 1; r <= cfg.rounds; r++) {
      sched.push({ p: "work", d: cfg.work, r });
      if (r < cfg.rounds) sched.push({ p: "rest", d: cfg.rest, r });
    }
  }
  const schedTotal = sched.reduce((a, s) => a + s.d, 0);
  const setUI = (phase, cls, clock, round) => {
    phaseEl.textContent = phase; phaseEl.className = "phase " + cls;
    clockEl.textContent = clock; clockEl.className = "clock num " + cls;
    roundEl.textContent = round;
  };
  const tick = () => {
    const el = (Date.now() - t0) / 1000;
    if (mode === "hiit" || mode === "tabata") {
      if (el >= schedTotal) { if (!done) { done = true; beepDone(); } clearInterval(int); setUI("DONE", "hiit-done", "0:00", "All rounds complete — finish & log"); return; }
      let acc = 0, idx = 0;
      while (el >= acc + sched[idx].d) { acc += sched[idx].d; idx++; }
      const cur = sched[idx], left = Math.ceil(acc + cur.d - el);
      if (idx !== lastMark) {
        if (lastMark >= 0) beepHi();
        lastMark = idx;
        if (cur.p === "work") say("Work. Round " + cur.r);
        else if (cur.p === "rest") say("Recover");
      }
      const map = { prep: ["GET READY", "hiit-prep"], work: ["WORK", "hiit-work"], rest: ["RECOVER", "hiit-rest"] };
      setUI(map[cur.p][0], map[cur.p][1], fmtClock(left), `Round ${cur.r} / ${cfg.rounds}`);
    } else if (mode === "emom") {
      const total = cfg.minutes * 60;
      if (el >= total) { if (!done) { done = true; beepDone(); } clearInterval(int); setUI("DONE", "hiit-done", "0:00", cfg.minutes + " minutes complete"); return; }
      const minute = Math.floor(el / 60);
      const exNow = exs[minute % exs.length];
      if (minute !== lastMark) { if (lastMark >= 0) beepHi(); lastMark = minute; if (exNow) say(exNow.name); }
      const ex = exNow;
      setUI(ex ? ex.name : "WORK", "hiit-work", fmtClock(60 - Math.floor(el % 60)), `Minute ${minute + 1} / ${cfg.minutes}`);
    } else if (mode === "amrap") {
      const left = cfg.minutes * 60 - el;
      if (left <= 0) { if (!done) { done = true; beepDone(); } clearInterval(int); setUI("TIME", "hiit-done", "0:00", rounds + " rounds — finish & log"); return; }
      setUI("AMRAP", "hiit-work", fmtClock(Math.ceil(left)), `${rounds} round${rounds === 1 ? "" : "s"} down`);
    } else if (mode === "rounds") {
      if (restUntil > Date.now()) {
        setUI("REST", "hiit-rest", fmtClock(Math.ceil((restUntil - Date.now()) / 1000)), `Round ${rounds} / ${cfg.rounds} done`);
        return;
      }
      if (rounds >= cfg.rounds) { if (!done) { done = true; beepDone(); } clearInterval(int); setUI("DONE", "hiit-done", fmtClock(Math.floor(el)), "All rounds complete — finish & log"); return; }
      setUI("WORK", "hiit-work", fmtClock(Math.floor(el)), `Round ${rounds + 1} / ${cfg.rounds}`);
    } else { // stopwatch
      setUI("ELAPSED", "hiit-prep", fmtClock(Math.floor(el)), " ");
    }
  };
  startBtn.onclick = () => {
    if (running) { running = false; clearInterval(int); pausedAt = Date.now(); startBtn.textContent = "Resume"; return; }
    running = true; startBtn.textContent = "Pause";
    if (pausedAt) { const d = Date.now() - pausedAt; t0 += d; if (restUntil) restUntil += d; } else t0 = Date.now();
    pausedAt = 0;
    clearInterval(int); int = setInterval(tick, 250); tick();
  };
  const lapBtn = $("#cd-lap");
  if (lapBtn) lapBtn.onclick = () => {
    if (!running) return;
    rounds++;
    beepHi();
    if (mode === "rounds" && rounds < cfg.rounds && cfg.rest) restUntil = Date.now() + cfg.rest * 1000;
    tick();
  };
  const openedAt = Date.now();
  $("#cd-finish").onclick = () => { clearInterval(int); finishCustom(w, rounds, Math.round((Date.now() - openedAt) / 1000)); };
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
    <button class="back-btn" data-act="more-back">‹ More</button>
    <div class="hdr"><h1>Equipment</h1></div>
    <div class="sub num">Toggle "I got this" and the exercise pool expands instantly — <b>${poolSize}</b> of ${EXERCISES.length} exercises currently eligible (gym days unlock the rest).</div>
    ${recEq ? `
      <div class="card next-buy">
        <div class="chip mind on">Next buy</div>
        <h3 style="margin-top:8px;">${esc(recEq.name)}</h3>
        <div class="info-note">${esc(rec.why)}</div>
        <button class="btn mind sm" style="margin-top:12px;" data-act="toggle-eq" data-eq="${recEq.id}">I got this ✓</button>
      </div>` : `<div class="card"><h3>${brushIcon("complete","var(--c-nutrition)")} Fully equipped</h3><div class="meta">Every tier unlocked. The ceiling is now you.</div></div>`}
    ${tiers}`;
}

/* ---------- More menu + sub-screens ---------- */
function renderMoreMenu() {
  return `
    <div class="hdr"><h1>More</h1></div>
    <div class="sub">Gear, recovery, and settings.</div>
    <button class="menu-card" data-act="more-nav" data-view="equip">
      ${motifSVG("strength", MOTIF_COLORS.strength)}
      <div class="dot strength"></div>
      <div><div class="m-title">Equipment</div><div class="m-sub">Tiers, unlocks, next-buy recommendation</div></div>
      <div class="m-arrow">›</div>
    </button>
    <button class="menu-card" data-act="more-nav" data-view="recovery">
      ${motifSVG("nutrition", MOTIF_COLORS.nutrition)}
      <div class="dot nutrition"></div>
      <div><div class="m-title">Recovery & nutrition</div><div class="m-sub">Protein, sleep, backup, settings</div></div>
      <div class="m-arrow">›</div>
    </button>`;
}

/* ---------- Recovery (nutrition + settings sub-screen) ---------- */
function renderRecovery() {
  const n = S.nutrition[todayISO()] || {};
  const month = new Date().getMonth(); // 0-11
  const vitD = month >= 9 || month <= 2; // Oct–Mar in Toronto
  const bw = latestMetric("BODYWEIGHT");
  const proteinTarget = bw ? Math.round(bw.value * 2.2 * 0.9) : null; // ~0.9 g/lb
  return `
    <button class="back-btn" data-act="more-back">‹ More</button>
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

    <div class="sec">Reminders</div>
    <div class="card stripe mind">
      <h3>Calendar reminders</h3>
      <div class="meta">Training days, rest day, nightly wind-down, monthly re-measure — as recurring calendar alerts your phone actually delivers.</div>
      <button class="btn mind sm" style="margin-top:12px;" data-act="open-reminders">Set up reminders</button>
    </div>

    <div class="sec">Data</div>
    <div class="card ${backupDue() ? "due-card" : ""}">
      <h3>Backup</h3>
      <div class="meta">${S.lastBackup ? "Last export: " + S.lastBackup : "Never exported."} All data lives on this device only — phone browsers can evict it if the app isn't opened for weeks. Export monthly; import moves data between phone and computer.</div>
      <div class="btn-row" style="margin-top:12px;">
        <button class="btn primary sm" data-act="export-backup">Export backup</button>
        <button class="btn ghost sm" data-act="import-backup">Import backup</button>
      </div>
    </div>

    <div class="sec">Settings</div>
    <div class="card">
      <div class="eq-row"><div><div class="eq-name">Theme</div><div class="eq-unlocks">${(S.settings.theme || "dark") === "light" ? "Light — sumi on washi" : (S.settings.theme === "auto" ? "Auto — follows the system" : "Dark — ink")}</div></div>
        <button class="btn ghost sm" data-act="cycle-theme">${{ dark:"Dark", light:"Light", auto:"Auto" }[S.settings.theme || "dark"]}</button></div>
      <div class="eq-row"><div><div class="eq-name">Voice guidance</div><div class="eq-unlocks">Spoken cues in timers & flows — for eyes-closed practice</div></div>
        <button class="eq-check ${S.settings.voice ? "on" : ""}" data-act="toggle-voice" aria-label="Toggle voice"></button></div>
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
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; min-height:82vh; gap:18px; padding:0 8px;">
      <h1 style="font-size:3.2rem; line-height:1;">Axis</h1>
      <svg viewBox="0 0 100 100" aria-hidden="true" style="width:88px; height:88px; color:var(--c-strength);">
        <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" stroke-width="5"
          stroke-linecap="round" stroke-dasharray="200 39" transform="rotate(-64 50 50)" opacity="0.9"/>
        <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-dasharray="30 209" transform="rotate(-80 50 50)" opacity="0.35"/>
        <circle cx="50" cy="50" r="7" fill="currentColor"/>
      </svg>
      <div style="display:flex; flex-direction:column; gap:14px; max-width:38ch; text-align:left;">
        <div><span class="sec" style="margin:0 0 3px; display:block; color:var(--c-strength);">Who</span>
        <p style="color:var(--text-2); font-size:0.92rem; line-height:1.6;">Men in their 30s who used to be fitter than they are — training inconsistently, carrying some waist, and starting to feel it.</p></div>
        <div><span class="sec" style="margin:0 0 3px; display:block; color:var(--c-breath);">What</span>
        <p style="color:var(--text-2); font-size:0.92rem; line-height:1.6;">One 6-day system for the whole machine: strength and a lean physique, stamina — in training and in bed — breath control, mobility, reaction speed, and the recovery that keeps testosterone up.</p></div>
        <div><span class="sec" style="margin:0 0 3px; display:block; color:var(--c-mind);">How</span>
        <p style="color:var(--text-2); font-size:0.92rem; line-height:1.6;">The app adapts every session to the equipment you have that day, remembers your numbers and progresses them for you, and makes the small daily work — pelvic floor, breath, mobility, meditation — one tap each.</p></div>
      </div>
      <button class="btn primary" style="max-width:280px;" data-act="ob-next">Set my baselines</button>
    </div>`;
  if (obStep === 1) {
    return `
    <div class="hdr" style="margin-top:20px;"><h1>Baselines</h1></div>
    <div class="sub">Four numbers, measured once, honestly. Skip any you can't do right now.</div>
    <div class="card stripe breath">
      <div class="meta"><b style="color:var(--text);">What these are for:</b> Axis uses your baselines to size your first targets, decide when to progress you, and draw honest trend lines — so in 8–12 weeks you can see change, not guess at it.</div>
      <div class="meta" style="margin-top:6px;"><b style="color:var(--text);">Where they live:</b> on this device only. No account, no cloud, nothing leaves your phone. You can export a backup file anytime from Recovery.</div>
    </div>
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
  if (tpl.custom) { runCustom(tpl.custom.id); return; }
  showSheet(`
    <h3>Where are you today?</h3>
    <button class="opt-row" data-loc="gym"><span class="o-ico">${brushIcon("gym","var(--c-strength)")}</span><span>At the gym<span class="o-sub">Full equipment — heavy compounds selected</span></span></button>
    <button class="opt-row" data-loc="home"><span class="o-ico">${brushIcon("home","var(--c-mobility)")}</span><span>Home<span class="o-sub">Your owned equipment: ${S.equipment.filter(e=>e!=="gym").map(id => (EQUIPMENT.find(q=>q.id===id)||{}).name).filter(Boolean).join(", ") || "bodyweight"}</span></span></button>
    <button class="opt-row" data-loc="travel"><span class="o-ico">${brushIcon("travel","var(--c-mind)")}</span><span>Traveling<span class="o-sub">Bodyweight only — session still fully completable</span></span></button>
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
    ${slots.some(s => s.sets && s.sets.length > 1) ? `<div class="info-note" style="margin:-4px 0 12px;">3×8–12 means 3 sets (rounds) of 8–12 reps (repetitions). Tap ✓ after each set — the rest timer runs itself. Tap any colored tag to learn the movement.</div>` : ""}
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
          ${ex.cue ? `<div class="cue">${esc(ex.cue)}</div>` : ""}
          ${ex.power ? `<div class="power-flag">${brushIcon("bolt","var(--c-hiit)")} Power — full recovery between reps (${Math.max(rx.rest,120)}s enforced)</div>` : ""}
        </div>
        <button class="swap-btn" data-act="swap-ex" data-si="${si}">Swap</button>
      </div>
      ${adv ? `<div class="last-time ${adv.cls}">${adv.html}</div>` : ""}
      <div class="set-rows">
        ${s.sets.map((set, xi) => `
          <div class="set-row">
            <div class="set-n num">${xi+1}</div>
            <input inputmode="numeric" placeholder="${timeBased ? unit : "reps"}" value="${set.reps ?? ""}" data-set-reps data-si="${si}" data-xi="${xi}">
            <button class="load-btn ${set.load ? "" : "empty"}" data-act="pick-load" data-si="${si}" data-xi="${xi}">${set.load ? esc(set.load) : (session.location === "gym" ? "kg" : "load")}</button>
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
    if (act === "pick-load") openLoadSheet(parseInt(si), parseInt(xi));
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

function bandIndexOf(loadStr) {
  if (!loadStr) return -1;
  const m = String(loadStr).toLowerCase();
  return BAND_ORDER.findIndex(c => m.includes(c));
}

function openLoadSheet(si, xi) {
  const s = session.slots[si];
  const cur = s.sets[xi].load || "";
  const applyLoad = (val, all) => {
    if (all) s.sets.forEach(x => x.load = val);
    else s.sets[xi].load = val;
    persistSession(false); closeSheet(); renderSession();
  };
  if (session.location === "gym") {
    showSheet(`
      <h3>Load — set ${xi + 1}</h3>
      <input class="big-input num" inputmode="decimal" id="load-in" placeholder="kg" value="${esc(cur)}">
      <div class="btn-row">
        <button class="btn primary" id="load-one">This set</button>
        <button class="btn ghost" id="load-all">All sets</button>
      </div>
    `, sheet => {
      const val = () => sheet.querySelector("#load-in").value.trim();
      sheet.querySelector("#load-one").onclick = () => applyLoad(val(), false);
      sheet.querySelector("#load-all").onclick = () => applyLoad(val(), true);
      sheet.querySelector("#load-in").focus();
    });
    return;
  }
  showSheet(`
    <h3>Band / load — set ${xi + 1}</h3>
    <div class="meta" style="margin-bottom:10px;">Lightest → heaviest. A tap fills this set and every set after it.</div>
    <div class="band-row">
      ${BAND_ORDER.map(c => `<button class="band-chip ${c}" data-band="${c} band">${c}</button>`).join("")}
      <button class="band-chip bw" data-band="bodyweight">bodyweight</button>
    </div>
    <input class="big-input" id="load-custom" placeholder="custom — red ×2, 8 kg pack…" value="${esc(cur)}">
    <div class="btn-row">
      <button class="btn primary" id="load-save">This set</button>
      <button class="btn ghost" id="load-save-all">All sets</button>
    </div>
  `, sheet => {
    sheet.querySelectorAll("[data-band]").forEach(b => b.onclick = () => {
      const v = b.dataset.band;
      s.sets.forEach((x, i) => { if (i >= xi) x.load = v; });
      persistSession(false); closeSheet(); renderSession();
    });
    sheet.querySelector("#load-save").onclick = () => applyLoad(sheet.querySelector("#load-custom").value.trim(), false);
    sheet.querySelector("#load-save-all").onclick = () => applyLoad(sheet.querySelector("#load-custom").value.trim(), true);
  });
}

function persistSession(completed) {
  const entries = session.slots.filter(s => s.ex).map(s => ({ exId: s.ex.id, sets: s.sets }));
  let log = S.workoutLogs.find(l => l.date === todayISO() && l.templateId === session.templateId);
  if (!log) { log = { date: todayISO(), templateId: session.templateId, location: session.location, entries: [], completed: false, startedAt: Date.now() }; S.workoutLogs.push(log); }
  if (!log.startedAt) log.startedAt = Date.now();
  log.entries = entries; log.location = session.location;
  log.restSecs = Math.round(session.restAccum || 0);
  if (completed) log.completed = true;
  save();
  return log;
}

/* volume score for session-to-session comparison: reps × load (bodyweight counts as 1) */
function sessionScore(log) {
  return (log.entries || []).flatMap(e => e.sets).filter(s => s.done)
    .reduce((a, s) => a + (s.reps || 1) * (parseFloat(s.load) || 1), 0);
}

function finishSession() {
  stopRestTimer(); // fold any running rest into the tally before persisting
  const log = persistSession(true);
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
  // ---- session summary ----
  const durSecs = log.startedAt ? Math.max(60, Date.now() - log.startedAt) / 1000 : 0;
  log.durationSecs = Math.round(durSecs);
  save();
  const allSets = session.slots.flatMap(s => s.sets);
  const doneSets = allSets.filter(s => s.done).length;
  const pct = allSets.length ? Math.round(doneSets / allSets.length * 100) : 0;
  const totalMin = Math.max(1, Math.round(durSecs / 60));
  const restMin = Math.round((log.restSecs || 0) / 60 * 10) / 10;
  const workMin = Math.max(0, Math.round((durSecs - (log.restSecs || 0)) / 60 * 10) / 10);
  const prev = [...S.workoutLogs].reverse().find(l => l.templateId === session.templateId && l.completed && l.date < todayISO());
  let trendRow = `<div class="eq-row"><div class="eq-name">vs last time</div><div class="eq-unlocks">First one logged — this is the baseline</div></div>`;
  if (prev) {
    const cur = sessionScore(log), old = sessionScore(prev);
    const d = old ? Math.round((cur - old) / old * 100) : 0;
    const prevMin = prev.durationSecs ? Math.round(prev.durationSecs / 60) : null;
    const dt = prevMin != null ? totalMin - prevMin : null;
    let arrow;
    if (d > 2 && dt != null && dt <= 0) arrow = ["↑", "var(--c-nutrition)", `+${d}% volume in ${dt === 0 ? "the same time" : Math.abs(dt) + " min less"} — clear improvement`];
    else if (d > 2) arrow = ["↑", "var(--c-nutrition)", `+${d}% volume — trending up`];
    else if (d >= -2 && dt != null && dt < 0) arrow = ["↑", "var(--c-nutrition)", `same work, ${Math.abs(dt)} min faster — conditioning is improving`];
    else if (d < -2) arrow = ["↓", "var(--c-hiit)", `${d}% volume — lighter day, that's fine`];
    else arrow = ["≈", "var(--text-2)", "level with last time — consistency wins"];
    trendRow = `<div class="eq-row"><div class="eq-name">vs last time (${prev.date})</div><div class="eq-unlocks" style="color:${arrow[1]}; font-weight:700;">${arrow[0]} ${arrow[2]}</div></div>`
      + (prevMin != null ? `<div class="eq-row"><div class="eq-name">Pace</div><div class="eq-unlocks num">${totalMin} min vs ${prevMin} min last time</div></div>` : "");
  }
  const tplLabel = session.tpl ? session.tpl.label : "Session";
  closeOverlay();
  render();
  showSheet(`
    <div style="text-align:center; margin-bottom:6px;">${flameSVG("var(--c-strength)")}</div>
    <h3 style="text-align:center;">${esc(tplLabel)} — done</h3>
    <div class="meta" style="text-align:center; margin-bottom:14px;">${flameSVG("var(--c-mind)")} ${workoutStreak()}-day streak</div>
    <div class="eq-row"><div class="eq-name">Total time</div><div class="eq-unlocks num" style="font-size:1.05rem; color:var(--text); font-weight:700;">${totalMin} min</div></div>
    <div class="eq-row"><div class="eq-name">Working</div><div class="eq-unlocks num" style="font-size:1rem; color:var(--text);">${workMin} min</div></div>
    <div class="eq-row"><div class="eq-name">Resting</div><div class="eq-unlocks num" style="font-size:1rem; color:var(--text);">${restMin} min</div></div>
    <div class="eq-row"><div class="eq-name">Completed</div><div class="eq-unlocks num" style="font-size:1rem; color:${pct >= 100 ? "var(--c-nutrition)" : "var(--text)"};">${doneSets}/${allSets.length} sets · ${pct}%</div></div>
    ${trendRow}
    <button class="btn primary" style="margin-top:14px;" id="sum-done">Done</button>
  `, sheet => { sheet.querySelector("#sum-done").onclick = closeSheet; });
}

/* ---------- rest timer ---------- */
let restInt = null, restStartedAt = 0;
function startRestTimer(secs, isPower) {
  stopRestTimer();
  restStartedAt = Date.now();
  const bar = $("#restbar");
  bar.classList.remove("hidden");
  bar.classList.toggle("power", !!isPower);
  let end = Date.now() + secs * 1000, total = secs, lastLeft = secs + 1;
  const draw = () => {
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    $("#restbar .rt-time").textContent = fmtClock(left);
    $("#restbar .rt-fill").style.width = (left / total * 100) + "%";
    if (left <= 3 && left > 0 && left !== lastLeft) beepLo();
    lastLeft = left;
    if (left <= 0) { stopRestTimer(); beepHi(); say("Rest over"); toast(isPower ? "Fully recovered — next explosive rep" : "Rest over — next set"); }
  };
  draw();
  restInt = setInterval(draw, 500);
  $("#restbar [data-act='skip-rest']").onclick = () => stopRestTimer();
  $("#restbar [data-act='add-rest']").onclick = () => { end += 30000; total += 30; draw(); };
}
function stopRestTimer() {
  if (restStartedAt && session) {
    session.restAccum = (session.restAccum || 0) + (Date.now() - restStartedAt) / 1000;
  }
  restStartedAt = 0;
  clearInterval(restInt); restInt = null; $("#restbar").classList.add("hidden");
}

/* =====================================================================
   TIMERS & TRACK FLOWS
===================================================================== */
function getOverlay() {
  let ov = $("#overlay");
  if (!ov) { ov = document.createElement("div"); ov.id = "overlay"; ov.className = "overlay"; document.body.appendChild(ov); }
  ov.classList.remove("hidden");
  acquireWake();
  return ov;
}
let overlayCleanup = null;
function closeOverlay() {
  if (overlayCleanup) { overlayCleanup(); overlayCleanup = null; }
  releaseWake();
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
    <div class="info-note note-hiit">Work = talk-impossible effort (≳85% max HR). Recovery = easy movement, nasal breathing if you can.</div>`);
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
    // full phase schedule computed up front; current phase derived from wall clock,
    // so backgrounding the phone never desyncs the intervals
    const sched = [{ p:"prep", d:10, r:1 }];
    for (let r = 1; r <= rounds; r++) {
      sched.push({ p:"work", d:work, r });
      if (r < rounds) sched.push({ p:"rest", d:rest, r });
    }
    const total = sched.reduce((a, s) => a + s.d, 0);
    const t0 = Date.now();
    const phaseEl = $("#h-phase"), clockEl = $("#h-clock"), roundEl = $("#h-round");
    let lastIdx = -1, lastLeft = -1, finished = false;
    clearInterval(int);
    int = setInterval(() => {
      const el = (Date.now() - t0) / 1000;
      if (el >= total) {
        clearInterval(int);
        phaseEl.textContent = "DONE"; phaseEl.className = "phase hiit-done";
        clockEl.className = "clock num hiit-done"; clockEl.textContent = "0:00";
        roundEl.textContent = "All rounds complete";
        if (!finished) { finished = true; beepDone(); markTrack("breath", {}); }
        return;
      }
      let acc = 0, idx = 0;
      while (el >= acc + sched[idx].d) { acc += sched[idx].d; idx++; }
      const cur = sched[idx];
      const left = Math.ceil(acc + cur.d - el);
      if (idx !== lastIdx) {
        if (lastIdx >= 0) beepHi();
        lastIdx = idx;
        if (cur.p === "work") say("Work. Round " + cur.r);
        else if (cur.p === "rest") say("Recover");
      }
      if (left <= 3 && left > 0 && left !== lastLeft) beepLo();
      lastLeft = left;
      const map = { prep:["GET READY","hiit-prep"], work:["WORK","hiit-work"], rest:["RECOVER","hiit-rest"] };
      phaseEl.textContent = map[cur.p][0];
      phaseEl.className = "phase " + map[cur.p][1];
      clockEl.className = "clock num " + map[cur.p][1];
      clockEl.textContent = fmtClock(left);
      roundEl.textContent = `Round ${cur.r} / ${rounds}`;
    }, 250);
  }
}

/* ---------- Box breathing ---------- */
function openBoxBreathing() {
  const ov = overlayShell("Box breathing", "breath", `
    <div class="pacer-wrap">
      <div class="box-wrap">
        <svg viewBox="0 0 240 240" style="position:absolute; inset:0; overflow:visible;" aria-hidden="true">
          <rect x="6" y="6" width="228" height="228" rx="32" class="box-track"/>
          <rect x="6" y="6" width="228" height="228" rx="32" class="box-snake" id="box-snake"/>
        </svg>
        <div class="box-label"><div class="bphase" id="bx-phase">Ready</div><div class="bcount num" id="bx-count">4</div></div>
      </div>
      <div class="round num" id="bx-total" style="color:var(--text-2); font-weight:700;">0:00</div>
      <button class="btn breath" style="max-width:240px;" id="bx-start">Begin — 4·4·4·4</button>
    </div>
    <div class="info-note note-breath" style="text-align:center;">Inhale 4 · hold 4 · exhale 4 · hold 4. The line rides the border — one side per phase. Pre-lift focus or pre-sleep wind-down.</div>`);
  let raf = 0, running = false, t0 = 0, pausedAt = 0, lastPi = -1, lastCount = -1, marked = false;
  overlayCleanup = () => cancelAnimationFrame(raf);
  const snake = $("#box-snake");
  const TOTAL_LEN = snake.getTotalLength();
  const SEG = TOTAL_LEN * 0.24;
  snake.style.strokeDasharray = `${SEG} ${TOTAL_LEN - SEG}`;
  snake.style.strokeDashoffset = "0";
  const PHASES = ["Inhale", "Hold", "Exhale", "Hold"];
  const COLORS = ["#3ED6C4", "#E8C36A", "#6C9FFF", "#E8C36A"]; // inhale teal · hold gold · exhale blue
  const tick = () => {
    if (!running) return;
    const el = (Date.now() - t0) / 1000;
    const cyc = el % 16;
    const pi = Math.floor(cyc / 4);
    // the line slides fluidly along the border path; colors switch per phase
    snake.style.strokeDashoffset = String(-(cyc / 16) * TOTAL_LEN);
    if (pi !== lastPi) {
      lastPi = pi;
      const c = COLORS[pi];
      snake.style.stroke = c;
      snake.style.filter = `drop-shadow(0 0 12px ${c})`;
      $("#bx-phase").textContent = PHASES[pi];
      $("#bx-phase").style.color = c;
      if (el > 0.5) beepLo();
    }
    const count = 4 - Math.floor(cyc % 4);
    if (count !== lastCount) { lastCount = count; $("#bx-count").textContent = count; $("#bx-total").textContent = fmtClock(Math.floor(el)); }
    if (el >= 120 && !marked) { marked = true; markTrack("breath", { breathType:"box" }); }
    raf = requestAnimationFrame(tick);
  };
  $("#bx-start").onclick = () => {
    if (running) { running = false; cancelAnimationFrame(raf); pausedAt = Date.now(); $("#bx-start").textContent = "Resume"; return; }
    running = true; $("#bx-start").textContent = "Pause";
    if (pausedAt) t0 += Date.now() - pausedAt; else t0 = Date.now();
    pausedAt = 0;
    raf = requestAnimationFrame(tick);
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
    <div class="info-note ${isMed ? "note-mind" : "note-breath"}" style="text-align:center;">${isMed
      ? "One hand on the abdomen, just below the sternum. Breathe into the hand. Attention rests at the solar plexus; when it wanders, return on the exhale."
      : half + "s in through the nose · " + half + "s out. This is the cortisol-lowering, testosterone-protecting session — not a soft extra."}</div>`);
  let int = null, running = false, t0 = 0, pausedAt = 0;
  overlayCleanup = () => clearInterval(int);
  $("#pc-start").onclick = () => {
    if (running) { clearInterval(int); running = false; pausedAt = Date.now(); $("#pc-start").textContent = "Resume"; return; }
    running = true; $("#pc-start").textContent = "Pause";
    if (pausedAt) t0 += Date.now() - pausedAt; else t0 = Date.now();
    pausedAt = 0;
    const pc = $("#pc");
    pc.style.transitionDuration = half + "s";
    let lastHalf = -1;
    clearInterval(int);
    int = setInterval(() => {
      const el = (Date.now() - t0) / 1000;
      const left = mins * 60 - el;
      const hi = Math.floor(el / half);
      if (hi !== lastHalf) {
        lastHalf = hi;
        const inhale = hi % 2 === 0;
        say(inhale ? "In" : "Out");
        pc.textContent = inhale ? "Inhale" : "Exhale";
        pc.classList.toggle("inhale", inhale);
        pc.classList.toggle("exhale", !inhale);
      }
      $("#pc-total").textContent = fmtClock(Math.max(0, Math.ceil(left))) + " remaining";
      if (left <= 0) {
        clearInterval(int); running = false; t0 = 0; pausedAt = 0;
        beepDone();
        markTrack(isMed ? "mind" : "breath", isMed ? {} : { breathType:"coherence" });
        pc.textContent = "Done ✓"; pc.classList.remove("inhale","exhale");
        $("#pc-start").textContent = "Again";
        toast(isMed ? "Meditation logged" : "Coherence session logged");
      }
    }, 250);
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
    <div class="info-note note-breath">While walking: normal exhale → hold to <b>moderate</b> air hunger (not panic) → release, nasal-only recovery ≥60 s → repeat 5–8×. Never while driving or in water.</div>`);
  let int = null, holding = false, holdStart = 0, rounds = 0, best = 0;
  overlayCleanup = () => clearInterval(int);
  const clock = $("#bh-clock"), phaseEl = $("#bh-phase"), roundEl = $("#bh-round"), btn = $("#bh-btn");
  btn.onclick = () => {
    if (!holding) {
      holding = true; holdStart = Date.now(); btn.textContent = "Release";
      say("Hold");
      phaseEl.textContent = "HOLDING — walk on"; phaseEl.style.color = "var(--c-hiit)";
      clearInterval(int);
      int = setInterval(() => { clock.textContent = fmtClock(Math.floor((Date.now() - holdStart) / 1000)); }, 250);
    } else {
      holding = false; rounds++;
      best = Math.max(best, Math.floor((Date.now() - holdStart) / 1000));
      roundEl.textContent = `Round ${rounds} · best hold ${fmtClock(best)}`;
      btn.textContent = "Exhale & hold";
      say("Recover. Nose only.");
      phaseEl.textContent = "Nasal recovery — 60 s easy"; phaseEl.style.color = "var(--c-breath)";
      clearInterval(int);
      const recEnd = Date.now() + 60000;
      let fired = false;
      int = setInterval(() => {
        const rec = Math.max(0, Math.ceil((recEnd - Date.now()) / 1000));
        clock.textContent = fmtClock(rec);
        if (rec <= 0 && !fired) { fired = true; clearInterval(int); phaseEl.textContent = "Ready for next hold"; beepHi(); }
      }, 250);
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
  let int = null, startT = 0, running = false;
  overlayCleanup = () => clearInterval(int);
  $("#bolt-btn").onclick = () => {
    if (!running) {
      running = true; startT = Date.now();
      $("#bolt-phase").textContent = "Holding — tap at first urge";
      $("#bolt-btn").textContent = "First urge — stop";
      int = setInterval(() => { $("#bolt-clock").textContent = Math.floor((Date.now() - startT) / 1000); }, 250);
    } else {
      clearInterval(int); running = false;
      const t = Math.max(1, Math.round((Date.now() - startT) / 1000));
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
    <div class="info-note note-pelvic" style="text-align:center;">Set 1–2: slow — 5 s squeeze / 5 s full release × 10. Set 3: quick flicks — 1 s on / 1 s off × 15.</div>`);
  let int = null, running = false, t0 = 0, pausedAt = 0, lastKey = "";
  overlayCleanup = () => clearInterval(int);
  $("#pf-pos").onclick = () => { S.pfPosition = posNext[pos]; save(); closeOverlay(); openPelvic(); };
  const fill = $("#pf-fill"), phaseEl = $("#pf-phase"), clockEl = $("#pf-clock"), roundEl = $("#pf-round");
  const startBtn = $("#pf-start");
  // schedule: set 1+2 = 10 reps × (5 s squeeze + 5 s release) = 100 s each;
  // set 3 = 15 flicks × (1 s + 1 s) = 30 s. All derived from wall clock.
  const SLOW = 100, TOTAL = SLOW * 2 + 30;
  const draw = () => {
    const el = (Date.now() - t0) / 1000;
    if (el >= TOTAL) {
      clearInterval(int); running = false; t0 = 0; pausedAt = 0; lastKey = "";
      phaseEl.textContent = "Complete"; clockEl.textContent = "✓"; fill.style.width = "0%";
      roundEl.textContent = "3 sets done";
      startBtn.textContent = "Again";
      markTrack("pelvic");
      beepDone(); toast("Pelvic floor logged · " + trackStreak("pelvic") + "-day streak");
      return;
    }
    let set, rep, within, dur, maxRep;
    if (el < SLOW * 2) {
      set = el < SLOW ? 1 : 2;
      const e = el % SLOW;
      rep = Math.floor(e / 10) + 1; within = e % 10; dur = 5; maxRep = 10;
    } else {
      set = 3;
      const e = el - SLOW * 2;
      rep = Math.floor(e / 2) + 1; within = e % 2; dur = 1; maxRep = 15;
    }
    const squeezing = within < dur;
    const key = set + "-" + rep + "-" + squeezing;
    if (key !== lastKey) {
      const setChanged = !lastKey.startsWith(set + "-");
      lastKey = key;
      if (setChanged && set === 3) say("Quick flicks. One second on, one off.");
      else if (set < 3) say(squeezing ? "Squeeze" : "Release");
      fill.style.transitionDuration = dur + "s";
      fill.style.width = squeezing ? "100%" : "0%";
      phaseEl.textContent = squeezing ? "SQUEEZE" : "RELEASE";
      phaseEl.style.color = squeezing ? "var(--c-pelvic)" : "var(--text-2)";
      clockEl.textContent = rep;
      roundEl.textContent = `Set ${set} of 3 · ${set === 3 ? "quick flicks" : "slow holds"} · rep ${rep}/${maxRep}`;
      if (set === 3) { if (squeezing) beep(1000, 0.06, 0.18); }
      else if (squeezing && rep === 1 && set === 2) beepHi();
      else beepLo();
    }
  };
  startBtn.onclick = () => {
    if (running) {
      // pause: freeze the clock and the fill bar where they are
      running = false; clearInterval(int); pausedAt = Date.now();
      const w = getComputedStyle(fill).width;
      fill.style.transitionDuration = "0s"; fill.style.width = w;
      phaseEl.textContent = "Paused"; phaseEl.style.color = "var(--text-3)";
      startBtn.textContent = "Resume";
      return;
    }
    running = true; startBtn.textContent = "Pause";
    if (pausedAt) t0 += Date.now() - pausedAt; else t0 = Date.now();
    pausedAt = 0; lastKey = "";
    clearInterval(int); int = setInterval(draw, 250); draw();
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
  let int = null, running = false, t0 = 0, pausedAt = 0, lastMi = -1, lastLeft = -1;
  overlayCleanup = () => clearInterval(int);
  ov.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { clearInterval(int); closeOverlay(); openMobilityPlayer(b.dataset.mode); });
  const bounds = []; let total = 0;
  flow.moves.forEach(m => { total += m.secs; bounds.push(total); });
  const startBtn = $("#mb-start");
  const draw = () => {
    const el = (Date.now() - t0) / 1000;
    if (el >= total) {
      clearInterval(int); running = false; t0 = 0; pausedAt = 0; lastMi = -1;
      $("#mb-name").textContent = "Flow complete ✓"; $("#mb-clock").textContent = "—"; $("#mb-cue").textContent = "";
      startBtn.textContent = "Again";
      markTrack("mobility");
      beepDone(); toast("Mobility logged · " + trackStreak("mobility") + "-day streak");
      return;
    }
    let mi = 0; while (el >= bounds[mi]) mi++;
    const left = Math.ceil(bounds[mi] - el);
    if (mi !== lastMi) { if (lastMi >= 0) beepHi(); lastMi = mi; say(flow.moves[mi].name + ". " + flow.moves[mi].cue); }
    if (left <= 3 && left !== lastLeft) beepLo();
    lastLeft = left;
    $("#mb-name").textContent = flow.moves[mi].name;
    $("#mb-cue").textContent = flow.moves[mi].cue;
    $("#mb-clock").textContent = fmtClock(left);
    $("#mb-prog").textContent = (mi+1) + " / " + flow.moves.length;
  };
  startBtn.onclick = () => {
    if (running) {
      running = false; clearInterval(int); pausedAt = Date.now();
      $("#mb-name").textContent = "Paused — " + flow.moves[Math.max(0, lastMi)].name;
      startBtn.textContent = "Resume";
      return;
    }
    running = true; startBtn.textContent = "Pause";
    if (pausedAt) t0 += Date.now() - pausedAt; else t0 = Date.now();
    pausedAt = 0;
    clearInterval(int); int = setInterval(draw, 250); draw();
  };
}

/* ---------- Stamina yoga flow (sexual health) ---------- */
function openYogaFlow() {
  const flow = SEX_YOGA_FLOW;
  const ov = overlayShell(flow.label, "pelvic", `
    <div class="card stripe pelvic">
      <div class="meta">${esc(flow.intro)}</div>
      <div class="meta" style="margin-top:6px; color:var(--text-3);">Skip or soften anything that pinches a knee, groin, or low back. Slow beats deep.</div>
    </div>
    <div class="big-timer" style="min-height:300px;">
      <div class="phase" id="yg-name" style="color:var(--c-pelvic); font-size:1.2rem; letter-spacing:0; text-transform:none;">${esc(flow.moves[0].name)}</div>
      <div class="clock num" id="yg-clock">${fmtClock(flow.moves[0].secs)}</div>
      <div class="round" id="yg-cue" style="max-width:320px; line-height:1.55; font-size:0.86rem;">${esc(flow.moves[0].cue)}</div>
      <div class="round num" id="yg-prog" style="color:var(--text-3);">1 / ${flow.moves.length}</div>
      <button class="btn pelvic" style="max-width:240px;" id="yg-start">Begin the flow</button>
    </div>
    <div class="info-note note-pelvic" style="text-align:center;">Nasal breathing throughout. Hold each pose for the count shown; stay with sensation.</div>`);
  let int = null, running = false, t0 = 0, pausedAt = 0, lastMi = -1, lastLeft = -1;
  overlayCleanup = () => clearInterval(int);
  const bounds = []; let total = 0;
  flow.moves.forEach(m => { total += m.secs; bounds.push(total); });
  const startBtn = $("#yg-start");
  const draw = () => {
    const el = (Date.now() - t0) / 1000;
    if (el >= total) {
      clearInterval(int); running = false; t0 = 0; pausedAt = 0; lastMi = -1;
      $("#yg-name").textContent = "Flow complete ✓"; $("#yg-clock").textContent = "—";
      $("#yg-cue").textContent = "Three doors into the same room: this flow, the daily kegels, and the aerobic dose.";
      startBtn.textContent = "Again";
      S.workoutLogs.push({ date: todayISO(), templateId: "sexyoga", location: "home",
        entries: [], completed: true, durationSecs: total });
      save();
      beepDone(); toast("Stamina yoga logged · " + Math.round(total / 60) + " min");
      return;
    }
    let mi = 0; while (el >= bounds[mi]) mi++;
    const left = Math.ceil(bounds[mi] - el);
    if (mi !== lastMi) { if (lastMi >= 0) beepHi(); lastMi = mi; say(flow.moves[mi].name + ". " + flow.moves[mi].cue); }
    if (left <= 3 && left !== lastLeft) beepLo();
    lastLeft = left;
    $("#yg-name").textContent = flow.moves[mi].name;
    $("#yg-cue").textContent = flow.moves[mi].cue;
    $("#yg-clock").textContent = fmtClock(left);
    $("#yg-prog").textContent = (mi + 1) + " / " + flow.moves.length;
  };
  startBtn.onclick = () => {
    if (running) {
      running = false; clearInterval(int); pausedAt = Date.now();
      $("#yg-name").textContent = "Paused — " + flow.moves[Math.max(0, lastMi)].name;
      startBtn.textContent = "Resume";
      return;
    }
    running = true; startBtn.textContent = "Pause";
    if (pausedAt) t0 += Date.now() - pausedAt; else t0 = Date.now();
    pausedAt = 0;
    clearInterval(int); int = setInterval(draw, 250); draw();
  };
}

/* ---------- Aerobic dose (sexual health — the vascular lever) ---------- */
function openAerobicDose() {
  const D = AEROBIC_DOSE;
  const ov = overlayShell("Aerobic dose", "pelvic", `
    <div class="card stripe pelvic">
      <div class="meta">${esc(D.intro)}</div>
      <div class="meta" style="margin-top:8px;">${D.dose.map(d => "· " + esc(d)).join("<br>")}</div>
      <div class="meta" style="margin-top:8px;"><b style="color:var(--text);">Pick any:</b> ${esc(D.options)}</div>
    </div>
    <div class="big-timer" style="min-height:260px;">
      <div class="phase" id="ad-phase" style="color:var(--c-pelvic);">40-minute session</div>
      <div class="clock num" id="ad-clock">${fmtClock(D.minutes * 60)}</div>
      <div class="round" id="ad-note" style="max-width:300px; line-height:1.5;">Breathing hard, conversation choppy — but not all-out.</div>
      <div class="btn-row" style="max-width:340px; width:100%;">
        <button class="btn pelvic" id="ad-start">Start</button>
        <button class="btn ghost" id="ad-finish">Finish & log</button>
      </div>
    </div>
    <div class="info-note note-pelvic" style="text-align:center;">${esc(D.mapping)}</div>`);
  let int = null, running = false, t0 = 0, pausedAt = 0, done = false;
  overlayCleanup = () => clearInterval(int);
  const totalSecs = D.minutes * 60;
  const startBtn = $("#ad-start");
  const tick = () => {
    const el = (Date.now() - t0) / 1000;
    const left = totalSecs - el;
    if (left <= 0) {
      clearInterval(int); running = false;
      $("#ad-clock").textContent = "0:00";
      $("#ad-phase").textContent = "Dose complete";
      $("#ad-note").textContent = "That's one of your four weekly touches. Finish & log it.";
      if (!done) { done = true; beepDone(); }
      return;
    }
    $("#ad-clock").textContent = fmtClock(Math.ceil(left));
  };
  startBtn.onclick = () => {
    if (running) { running = false; clearInterval(int); pausedAt = Date.now(); startBtn.textContent = "Resume"; return; }
    running = true; startBtn.textContent = "Pause";
    if (pausedAt) t0 += Date.now() - pausedAt; else t0 = Date.now();
    pausedAt = 0;
    clearInterval(int); int = setInterval(tick, 500); tick();
  };
  $("#ad-finish").onclick = () => {
    clearInterval(int);
    const el = t0 ? Math.round(Math.min(totalSecs, (pausedAt || Date.now()) - t0) / 1000) : 0;
    if (el >= 60) {
      S.workoutLogs.push({ date: todayISO(), templateId: "aerobic40", location: "home",
        entries: [], completed: true, durationSecs: el });
      save();
      toast("Aerobic session logged · " + Math.round(el / 60) + " min");
    }
    closeOverlay(); render();
  };
}


/* ---------- stick-figure movement demos ----------
   Procedural 2D "ink figure": each animation is 2–4 keyframe poses of named
   joints in a 100×100 side-view box (x right, y down, floor y≈88), interpolated
   and looped on canvas. Pattern-level animations cover every exercise; animal
   flows get their own rigs. Joints: hd head, n neck, h hip, k1/a1 front knee+
   ankle, k2/a2 back leg, e/w near arm, e2/w2 far arm (optional). */
const STICK_ANIMS = {
  squat:   { poses: [
    { hd:[50,15], n:[50,24], h:[50,52], k1:[47,70], a1:[47,87], k2:[54,70], a2:[54,87], e:[52,38], w:[53,50], e2:[48,38], w2:[47,50] },
    { hd:[46,36], n:[47,44], h:[41,62], k1:[59,63], a1:[54,86], k2:[62,65], a2:[57,87], e:[58,47], w:[68,42], e2:[55,49], w2:[65,45] },
  ]},
  hinge:   { poses: [
    { hd:[50,15], n:[50,24], h:[50,52], k1:[47,70], a1:[47,87], k2:[54,70], a2:[54,87], e:[52,38], w:[53,50], e2:[48,38], w2:[47,50] },
    { hd:[67,36], n:[63,42], h:[42,56], k1:[45,71], a1:[46,87], k2:[49,71], a2:[50,87], e:[61,52], w:[59,66], e2:[58,53], w2:[56,67] },
  ]},
  lunge:   { poses: [
    { hd:[50,18], n:[50,27], h:[50,54], k1:[58,68], a1:[60,87], k2:[43,69], a2:[38,87], e:[52,40], w:[53,52], e2:[48,40], w2:[47,52] },
    { hd:[50,27], n:[50,36], h:[50,62], k1:[62,67], a1:[61,86], k2:[43,77], a2:[32,86], e:[52,48], w:[53,60], e2:[48,48], w2:[47,60] },
  ]},
  pushup:  { poses: [
    { hd:[20,52], n:[28,55], h:[56,59], k1:[69,62], a1:[83,65], k2:[70,64], a2:[84,67], e:[32,67], w:[31,80], e2:[35,66], w2:[34,80] },
    { hd:[19,68], n:[27,69], h:[56,69], k1:[69,70], a1:[83,71], k2:[70,72], a2:[84,73], e:[40,78], w:[31,80], e2:[43,77], w2:[34,80] },
  ]},
  press:   { poses: [
    { hd:[50,17], n:[50,26], h:[50,53], k1:[47,70], a1:[47,87], k2:[54,70], a2:[54,87], e:[58,31], w:[56,22], e2:[42,31], w2:[44,22] },
    { hd:[50,15], n:[50,24], h:[50,52], k1:[47,70], a1:[47,87], k2:[54,70], a2:[54,87], e:[56,15], w:[55,3],  e2:[44,15], w2:[45,3] },
  ]},
  row:     { poses: [
    { hd:[65,36], n:[62,42], h:[42,56], k1:[45,71], a1:[46,87], k2:[49,71], a2:[50,87], e:[63,52], w:[65,68], e2:[60,53], w2:[62,69] },
    { hd:[65,36], n:[62,42], h:[42,56], k1:[45,71], a1:[46,87], k2:[49,71], a2:[50,87], e:[66,45], w:[58,50], e2:[63,46], w2:[55,51] },
  ]},
  pullup:  { props: [[26,10,74,10]], poses: [
    { hd:[50,31], n:[50,39], h:[50,62], k1:[47,72], a1:[45,84], k2:[53,72], a2:[51,84], e:[55,23], w:[53,11], e2:[45,23], w2:[47,11] },
    { hd:[50,17], n:[50,25], h:[50,50], k1:[44,61], a1:[42,74], k2:[56,62], a2:[54,75], e:[59,19], w:[53,11], e2:[41,19], w2:[47,11] },
  ]},
  plank:   { poses: [
    { hd:[20,52], n:[28,55], h:[56,58], k1:[69,61], a1:[83,64], k2:[70,63], a2:[84,66], e:[30,67], w:[29,80], e2:[33,66], w2:[32,80] },
    { hd:[20,54], n:[28,57], h:[56,57], k1:[69,60], a1:[83,64], k2:[70,62], a2:[84,66], e:[30,68], w:[29,80], e2:[33,67], w2:[32,80] },
  ]},
  carry:   { loop:"cycle", poses: [
    { hd:[50,15], n:[50,24], h:[50,52], k1:[56,69], a1:[60,87], k2:[45,70], a2:[40,87], e:[54,40], w:[56,58], e2:[46,40], w2:[44,58] },
    { hd:[50,14], n:[50,23], h:[50,51], k1:[51,70], a1:[52,87], k2:[50,70], a2:[48,87], e:[54,39], w:[56,57], e2:[46,39], w2:[44,57] },
    { hd:[50,15], n:[50,24], h:[50,52], k1:[45,70], a1:[40,87], k2:[56,69], a2:[60,87], e:[54,40], w:[56,58], e2:[46,40], w2:[44,58] },
    { hd:[50,14], n:[50,23], h:[50,51], k1:[50,70], a1:[48,87], k2:[51,70], a2:[52,87], e:[54,39], w:[56,57], e2:[46,39], w2:[44,57] },
  ]},
  jump:    { poses: [
    { hd:[47,34], n:[48,42], h:[43,60], k1:[58,62], a1:[53,85], k2:[61,64], a2:[56,86], e:[40,50], w:[32,58], e2:[43,52], w2:[35,60] },
    { hd:[50,5],  n:[50,14], h:[50,40], k1:[54,52], a1:[51,64], k2:[58,54], a2:[55,67], e:[58,16], w:[62,5],  e2:[42,16], w2:[38,5] },
  ]},
  run:     { loop:"cycle", poses: [
    { hd:[50,18], n:[50,27], h:[50,54], k1:[60,64], a1:[58,79], k2:[44,72], a2:[36,84], e:[58,36], w:[63,45], e2:[43,38], w2:[38,29] },
    { hd:[50,16], n:[50,25], h:[50,52], k1:[52,68], a1:[52,84], k2:[49,69], a2:[47,85], e:[52,37], w:[55,47], e2:[49,37], w2:[46,47] },
    { hd:[50,18], n:[50,27], h:[50,54], k1:[44,66], a1:[38,80], k2:[58,70], a2:[64,84], e:[42,36], w:[37,45], e2:[57,38], w2:[62,29] },
    { hd:[50,16], n:[50,25], h:[50,52], k1:[49,68], a1:[47,84], k2:[52,69], a2:[52,85], e:[49,37], w:[46,47], e2:[52,37], w2:[55,47] },
  ]},
  bear:    { loop:"cycle", poses: [
    { hd:[22,42], n:[30,46], h:[60,45], k1:[64,62], a1:[61,87], k2:[71,59], a2:[75,87], e:[34,63], w:[32,87], e2:[43,61], w2:[46,87] },
    { hd:[22,42], n:[30,46], h:[60,45], k1:[71,59], a1:[75,87], k2:[64,62], a2:[61,87], e:[43,61], w:[46,87], e2:[34,63], w2:[32,87] },
  ]},
  beast:   { loop:"cycle", poses: [
    { hd:[22,50], n:[30,53], h:[59,56], k1:[63,73], a1:[62,87], k2:[70,71], a2:[74,87], e:[33,68], w:[32,87], e2:[42,66], w2:[44,87] },
    { hd:[22,50], n:[30,53], h:[59,56], k1:[70,71], a1:[74,87], k2:[63,73], a2:[62,87], e:[42,66], w:[44,87], e2:[33,68], w2:[32,87] },
  ]},
  crab:    { loop:"cycle", poses: [
    { hd:[69,38], n:[63,43], h:[43,52], k1:[31,56], a1:[27,85], k2:[37,58], a2:[33,85], e:[69,60], w:[72,85], e2:[76,58], w2:[80,84] },
    { hd:[69,38], n:[63,43], h:[43,52], k1:[37,58], a1:[33,85], k2:[31,56], a2:[27,85], e:[76,58], w:[80,84], e2:[69,60], w2:[72,85] },
  ]},
  crabreach: { poses: [
    { hd:[69,38], n:[63,43], h:[43,52], k1:[31,56], a1:[27,85], k2:[37,58], a2:[33,85], e:[69,60], w:[72,85], e2:[76,58], w2:[80,84] },
    { hd:[64,33], n:[59,40], h:[45,40], k1:[30,50], a1:[27,84], k2:[36,52], a2:[33,84], e:[50,28], w:[34,18], e2:[75,56], w2:[79,84] },
  ]},
  scorpion: { poses: [
    { hd:[22,50], n:[30,53], h:[59,56], k1:[63,73], a1:[62,87], k2:[70,71], a2:[74,87], e:[33,68], w:[32,87], e2:[42,66], w2:[44,87] },
    { hd:[22,48], n:[30,51], h:[55,50], k1:[61,71], a1:[60,87], k2:[54,36], a2:[38,24], e:[33,67], w:[32,87], e2:[42,65], w2:[44,87] },
  ]},
  ape:     { poses: [
    { hd:[44,40], n:[45,48], h:[42,64], k1:[56,64], a1:[52,86], k2:[59,66], a2:[55,87], e:[54,62], w:[62,84], e2:[58,60], w2:[66,84] },
    { hd:[54,36], n:[55,44], h:[62,46], k1:[70,56], a1:[74,70], k2:[74,58], a2:[78,72], e:[56,58], w:[62,84], e2:[60,56], w2:[66,84] },
  ]},
  duck:    { loop:"cycle", poses: [
    { hd:[46,38], n:[47,46], h:[42,63], k1:[58,63], a1:[56,86], k2:[59,68], a2:[48,87], e:[55,50], w:[62,53], e2:[52,51], w2:[59,54] },
    { hd:[46,37], n:[47,45], h:[42,62], k1:[59,68], a1:[48,87], k2:[58,63], a2:[56,86], e:[55,49], w:[62,52], e2:[52,50], w2:[59,53] },
  ]},
  inchworm: { poses: [
    { hd:[56,50], n:[54,55], h:[46,48], k1:[47,67], a1:[48,87], k2:[50,67], a2:[51,87], e:[56,64], w:[54,79], e2:[53,65], w2:[51,80] },
    { hd:[36,50], n:[40,51], h:[54,38], k1:[57,60], a1:[54,86], k2:[59,61], a2:[57,87], e:[32,62], w:[28,79], e2:[35,63], w2:[31,80] },
    { hd:[20,52], n:[28,55], h:[56,59], k1:[69,62], a1:[83,65], k2:[70,64], a2:[84,67], e:[32,67], w:[31,80], e2:[35,66], w2:[34,80] },
  ]},
  wave:    { dur: 950, poses: [
    { hd:[36,48], n:[40,50], h:[56,36], k1:[59,58], a1:[57,86], k2:[61,60], a2:[60,87], e:[32,60], w:[28,78], e2:[35,61], w2:[31,79] },
    { hd:[23,70], n:[30,68], h:[52,56], k1:[62,64], a1:[70,80], k2:[63,66], a2:[72,82], e:[33,76], w:[29,84], e2:[36,75], w2:[32,85] },
    { hd:[25,38], n:[29,45], h:[49,64], k1:[63,68], a1:[78,72], k2:[64,70], a2:[79,74], e:[31,57], w:[29,79], e2:[34,58], w2:[32,80] },
  ]},
  kickthrough: { poses: [
    { hd:[22,50], n:[30,53], h:[59,56], k1:[63,73], a1:[62,87], k2:[70,71], a2:[74,87], e:[33,68], w:[32,87], e2:[42,66], w2:[44,87] },
    { hd:[40,40], n:[44,48], h:[58,60], k1:[40,66], a1:[24,70], k2:[64,74], a2:[70,86], e:[34,50], w:[28,38], e2:[52,64], w2:[50,86] },
  ]},
  walklunge: { loop:"cycle", dur: 900, poses: [
    { hd:[46,26], n:[46,35], h:[46,61], k1:[58,66], a1:[57,86], k2:[39,76], a2:[28,86], e:[50,44], w:[54,54], e2:[42,44], w2:[38,54] },
    { hd:[50,18], n:[50,27], h:[50,55], k1:[52,70], a1:[52,87], k2:[48,70], a2:[46,87], e:[52,40], w:[53,52], e2:[48,40], w2:[47,52] },
    { hd:[46,26], n:[46,35], h:[46,61], k1:[39,76], a1:[28,86], k2:[58,66], a2:[57,86], e:[42,44], w:[38,54], e2:[50,44], w2:[54,54] },
    { hd:[50,18], n:[50,27], h:[50,55], k1:[48,70], a1:[46,87], k2:[52,70], a2:[52,87], e:[48,40], w:[47,52], e2:[52,40], w2:[53,52] },
  ]},
  pistol: { poses: [
    { hd:[50,15], n:[50,24], h:[50,52], k1:[49,70], a1:[49,87], k2:[59,57], a2:[70,60], e:[56,36], w:[63,40], e2:[53,37], w2:[60,41] },
    { hd:[46,40], n:[47,47], h:[43,66], k1:[57,68], a1:[52,86], k2:[57,64], a2:[74,62], e:[56,52], w:[66,50], e2:[53,53], w2:[63,51] },
  ]},
  hindusquat: { dur: 750, poses: [
    { hd:[50,15], n:[50,24], h:[50,52], k1:[47,70], a1:[47,87], k2:[54,70], a2:[54,87], e:[57,35], w:[66,38], e2:[54,36], w2:[63,39] },
    { hd:[47,38], n:[48,46], h:[44,64], k1:[58,64], a1:[54,81], k2:[61,66], a2:[57,82], e:[52,54], w:[52,68], e2:[49,55], w2:[49,69] },
    { hd:[50,15], n:[50,24], h:[50,52], k1:[47,70], a1:[47,87], k2:[54,70], a2:[54,87], e:[44,37], w:[36,44], e2:[41,38], w2:[33,45] },
  ]},
  slrdl: { poses: [
    { hd:[50,15], n:[50,24], h:[50,52], k1:[47,70], a1:[47,87], k2:[54,70], a2:[54,87], e:[52,38], w:[53,50], e2:[48,38], w2:[47,50] },
    { hd:[66,38], n:[62,44], h:[45,56], k1:[46,71], a1:[47,87], k2:[58,52], a2:[72,48], e:[60,52], w:[58,68], e2:[57,53], w2:[55,69] },
  ]},
  seatedrow: { poses: [
    { hd:[43,34], n:[43,43], h:[40,66], k1:[56,68], a1:[72,72], k2:[57,70], a2:[73,74], e:[52,49], w:[64,50], e2:[49,50], w2:[61,51] },
    { hd:[41,33], n:[41,42], h:[40,66], k1:[56,68], a1:[72,72], k2:[57,70], a2:[73,74], e:[50,53], w:[42,52], e2:[47,54], w2:[39,53] },
  ]},
  bench: { props: [[24,72,76,72]], poses: [
    { hd:[27,66], n:[34,67], h:[58,68], k1:[68,74], a1:[70,87], k2:[70,76], a2:[72,87], e:[39,58], w:[40,46], e2:[42,59], w2:[43,47] },
    { hd:[27,66], n:[34,67], h:[58,68], k1:[68,74], a1:[70,87], k2:[70,76], a2:[72,87], e:[35,70], w:[39,58], e2:[38,71], w2:[42,59] },
  ]},
  pike: { poses: [
    { hd:[33,54], n:[38,53], h:[56,38], k1:[59,60], a1:[57,86], k2:[61,62], a2:[60,87], e:[31,64], w:[28,80], e2:[34,65], w2:[31,81] },
    { hd:[28,74], n:[33,64], h:[54,42], k1:[58,62], a1:[57,86], k2:[60,64], a2:[60,87], e:[25,72], w:[27,83], e2:[28,73], w2:[30,84] },
  ]},
  invrow: { props: [[22,42,78,42]], poses: [
    { hd:[24,62], n:[31,64], h:[54,72], k1:[65,76], a1:[78,83], k2:[66,78], a2:[79,84], e:[34,54], w:[32,43], e2:[37,55], w2:[35,43] },
    { hd:[23,50], n:[30,53], h:[53,66], k1:[64,72], a1:[78,83], k2:[65,74], a2:[79,84], e:[37,49], w:[32,43], e2:[40,50], w2:[35,43] },
  ]},
  pullapart: { poses: [
    { hd:[50,15], n:[50,24], h:[50,52], k1:[47,70], a1:[47,87], k2:[54,70], a2:[54,87], e:[58,35], w:[68,35], e2:[57,36], w2:[67,36] },
    { hd:[50,15], n:[50,24], h:[50,52], k1:[47,70], a1:[47,87], k2:[54,70], a2:[54,87], e:[52,37], w:[42,39], e2:[51,38], w2:[41,40] },
  ]},
  prone: { poses: [
    { hd:[21,81], n:[29,82], h:[55,83], k1:[68,84], a1:[83,85], k2:[69,85], a2:[84,86], e:[15,82], w:[8,82],  e2:[17,83], w2:[10,83] },
    { hd:[19,72], n:[28,76], h:[55,83], k1:[68,84], a1:[83,85], k2:[69,85], a2:[84,86], e:[13,72], w:[6,66],  e2:[15,73], w2:[8,67] },
  ]},
  crunchk: { poses: [
    { hd:[45,32], n:[46,40], h:[48,62], k1:[50,76], a1:[62,80], k2:[52,77], a2:[64,81], e:[52,40], w:[48,33], e2:[49,41], w2:[45,34] },
    { hd:[54,54], n:[52,48], h:[48,62], k1:[50,76], a1:[62,80], k2:[52,77], a2:[64,81], e:[58,52], w:[56,55], e2:[55,53], w2:[53,56] },
  ]},
  rollout: { poses: [
    { hd:[36,54], n:[40,57], h:[54,66], k1:[56,78], a1:[68,82], k2:[58,79], a2:[70,83], e:[38,68], w:[36,80], e2:[41,69], w2:[39,80] },
    { hd:[24,58], n:[30,61], h:[50,70], k1:[54,79], a1:[67,83], k2:[56,80], a2:[69,84], e:[22,70], w:[15,80], e2:[25,71], w2:[18,80] },
  ]},
  pallof: { poses: [
    { hd:[50,15], n:[50,24], h:[50,52], k1:[47,70], a1:[47,87], k2:[54,70], a2:[54,87], e:[55,38], w:[52,42], e2:[52,39], w2:[49,43] },
    { hd:[50,15], n:[50,24], h:[50,52], k1:[47,70], a1:[47,87], k2:[54,70], a2:[54,87], e:[58,38], w:[68,38], e2:[55,39], w2:[65,39] },
  ]},
  hollow: { poses: [
    { hd:[25,68], n:[31,73], h:[52,80], k1:[66,74], a1:[79,68], k2:[67,76], a2:[80,70], e:[19,64], w:[12,58], e2:[21,66], w2:[14,60] },
    { hd:[26,72], n:[32,76], h:[52,80], k1:[66,76], a1:[79,72], k2:[67,78], a2:[80,74], e:[20,68], w:[13,63], e2:[22,70], w2:[15,65] },
  ]},
  deadbug: { loop:"cycle", poses: [
    { hd:[22,79], n:[29,80], h:[52,81], k1:[56,64], a1:[66,66], k2:[58,65], a2:[68,67], e:[31,69], w:[32,59], e2:[34,69], w2:[35,59] },
    { hd:[22,79], n:[29,80], h:[52,81], k1:[56,64], a1:[66,66], k2:[64,72], a2:[79,78], e:[24,69], w:[13,73], e2:[34,69], w2:[35,59] },
    { hd:[22,79], n:[29,80], h:[52,81], k1:[56,64], a1:[66,66], k2:[58,65], a2:[68,67], e:[31,69], w:[32,59], e2:[34,69], w2:[35,59] },
    { hd:[22,79], n:[29,80], h:[52,81], k1:[64,72], a1:[79,78], k2:[58,65], a2:[68,67], e:[31,69], w:[32,59], e2:[24,69], w2:[13,73] },
  ]},
  legraise: { poses: [
    { hd:[21,80], n:[28,81], h:[52,82], k1:[68,83], a1:[84,84], k2:[69,84], a2:[85,85], e:[35,82], w:[43,83], e2:[37,83], w2:[45,84] },
    { hd:[21,80], n:[28,81], h:[52,82], k1:[54,66], a1:[56,50], k2:[55,67], a2:[57,51], e:[35,82], w:[43,83], e2:[37,83], w2:[45,84] },
  ]},
  swing: { dur: 700, poses: [
    { hd:[62,40], n:[59,45], h:[44,58], k1:[47,70], a1:[48,87], k2:[51,70], a2:[52,87], e:[55,57], w:[49,67], e2:[52,58], w2:[46,68] },
    { hd:[50,15], n:[50,24], h:[50,52], k1:[47,70], a1:[47,87], k2:[54,70], a2:[54,87], e:[58,34], w:[69,34], e2:[55,35], w2:[66,35] },
  ]},
  rope: { loop:"cycle", dur: 420, poses: [
    { hd:[50,16], n:[50,25], h:[50,53], k1:[48,70], a1:[48,87], k2:[53,70], a2:[53,87], e:[57,44], w:[63,50], e2:[43,44], w2:[37,50] },
    { hd:[50,12], n:[50,21], h:[50,49], k1:[48,66], a1:[48,82], k2:[53,66], a2:[53,82], e:[57,41], w:[64,45], e2:[43,41], w2:[36,45] },
  ]},
  burpee: { loop:"cycle", dur: 800, poses: [
    { hd:[44,48], n:[45,54], h:[43,68], k1:[56,68], a1:[52,86], k2:[59,70], a2:[55,87], e:[47,64], w:[46,82], e2:[50,63], w2:[49,82] },
    { hd:[20,52], n:[28,55], h:[56,59], k1:[69,62], a1:[83,65], k2:[70,64], a2:[84,67], e:[32,67], w:[31,80], e2:[35,66], w2:[34,80] },
    { hd:[44,48], n:[45,54], h:[43,68], k1:[56,68], a1:[52,86], k2:[59,70], a2:[55,87], e:[47,64], w:[46,82], e2:[50,63], w2:[49,82] },
    { hd:[50,5],  n:[50,14], h:[50,40], k1:[52,54], a1:[50,66], k2:[56,55], a2:[54,68], e:[58,16], w:[62,5], e2:[42,16], w2:[38,5] },
  ]},
  climber: { loop:"cycle", dur: 500, poses: [
    { hd:[20,52], n:[28,55], h:[56,58], k1:[46,62], a1:[42,72], k2:[70,62], a2:[84,66], e:[30,67], w:[29,80], e2:[33,66], w2:[32,80] },
    { hd:[20,52], n:[28,55], h:[56,58], k1:[70,62], a1:[84,66], k2:[46,62], a2:[42,72], e:[30,67], w:[29,80], e2:[33,66], w2:[32,80] },
  ]},
  shadowbox: { loop:"cycle", dur: 550, poses: [
    { hd:[48,20], n:[48,29], h:[48,55], k1:[57,69], a1:[59,87], k2:[41,70], a2:[37,87], e:[59,32], w:[71,30], e2:[44,32], w2:[47,26] },
    { hd:[49,21], n:[49,30], h:[49,56], k1:[58,70], a1:[59,87], k2:[42,71], a2:[37,87], e:[55,34], w:[57,28], e2:[46,33], w2:[49,27] },
    { hd:[48,20], n:[48,29], h:[48,55], k1:[57,69], a1:[59,87], k2:[41,70], a2:[37,87], e:[44,32], w:[47,26], e2:[59,32], w2:[71,30] },
    { hd:[49,21], n:[49,30], h:[49,56], k1:[58,70], a1:[59,87], k2:[42,71], a2:[37,87], e:[46,33], w:[49,27], e2:[55,34], w2:[57,28] },
  ]},
};
const PATTERN_ANIM = {
  SQUAT:"squat", HINGE:"hinge", LUNGE:"lunge", H_PUSH:"pushup", V_PUSH:"press",
  H_PULL:"row", V_PULL:"pullup", CORE:"plank", CARRY:"carry", PLYO:"jump",
  CARDIO:"run", REACTION:"run", FLOW:"bear",
};
const EX_ANIM = {
  // animal flow
  bear_crawl:"bear", beast_crawl:"beast", lizard_crawl:"beast", crab_walk:"crab",
  crab_reach:"crabreach", scorpion_reach:"scorpion", ape_walk:"ape", duck_walk:"duck",
  frog_hop:"jump", inchworm:"inchworm", kick_through:"kickthrough",
  // squat family
  pistol_prog:"pistol", hindu_squat:"hindusquat",
  // hinge family
  sl_rdl_bw:"slrdl", kb_swing:"swing",
  // lunges
  walking_lunge:"walklunge", bb_lunge:"walklunge",
  // pushes
  hindu_pushup:"wave", tyson_pushup:"pushup", bb_bench:"bench", db_bench:"bench", pike_pushup:"pike",
  // pulls
  cable_row:"seatedrow", ring_row:"invrow", table_row:"invrow",
  band_pullapart:"pullapart", prone_pull:"prone",
  // core
  cable_crunch:"crunchk", ab_wheel:"rollout", band_pallof:"pallof",
  hollow_hold:"hollow", deadbug:"deadbug", leg_raise:"legraise", plank:"plank",
  // conditioning
  rope_intervals:"rope", burpee:"burpee", mountain_climber:"climber", shadowbox:"shadowbox",
};
function stickAnimFor(ex) {
  return STICK_ANIMS[EX_ANIM[ex.id]] || STICK_ANIMS[PATTERN_ANIM[ex.pattern]] || null;
}
let stickRaf = 0;
function startStickAnim(canvas, anim) {
  cancelAnimationFrame(stickRaf);
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const css = getComputedStyle(document.documentElement);
  const ink = css.getPropertyValue("--text").trim() || "#F4F2EC";
  const faint = css.getPropertyValue("--line").trim() || "#26262E";
  // pingpong by default: A→B→A; "cycle" wraps A→B→A directly
  const seq = anim.loop === "cycle" ? anim.poses : anim.poses.concat(anim.poses.slice(1, -1).reverse());
  const dur = anim.dur || 1100;
  const ease = t => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
  const sx = v => v / 100 * W, sy = v => v / 100 * H;
  const seg = (a, b) => { ctx.beginPath(); ctx.moveTo(sx(a[0]), sy(a[1])); ctx.lineTo(sx(b[0]), sy(b[1])); ctx.stroke(); };
  const tick = now => {
    const total = dur * seq.length;
    const ph = (now % total) / dur;
    const i = Math.floor(ph), t = ease(ph - i);
    const A = seq[i], B = seq[(i + 1) % seq.length];
    const P = {};
    for (const k of Object.keys(A)) {
      const b = B[k] || A[k];
      P[k] = [A[k][0] + (b[0] - A[k][0]) * t, A[k][1] + (b[1] - A[k][1]) * t];
    }
    ctx.clearRect(0, 0, W, H);
    // floor + props
    ctx.strokeStyle = faint; ctx.lineWidth = 2; ctx.lineCap = "round";
    seg([6, 88], [94, 88]);
    (anim.props || []).forEach(p => seg([p[0], p[1]], [p[2], p[3]]));
    // far limbs, fainter (depth)
    ctx.strokeStyle = ink; ctx.lineJoin = "round"; ctx.lineCap = "round";
    if (P.e2) { ctx.globalAlpha = 0.4; ctx.lineWidth = 4.5; seg(P.n, P.e2); seg(P.e2, P.w2); ctx.globalAlpha = 1; }
    ctx.globalAlpha = 0.55; ctx.lineWidth = 4.5; seg(P.h, P.k2); seg(P.k2, P.a2); ctx.globalAlpha = 1;
    // near limbs + spine
    ctx.lineWidth = 5.5;
    seg(P.n, P.h); seg(P.h, P.k1); seg(P.k1, P.a1); seg(P.n, P.e); seg(P.e, P.w);
    // head
    ctx.beginPath(); ctx.arc(sx(P.hd[0]), sy(P.hd[1]), sx(6), 0, Math.PI * 2); ctx.stroke();
    stickRaf = requestAnimationFrame(tick);
  };
  stickRaf = requestAnimationFrame(tick);
}

/* ---------- Breathwork hub ---------- */
function openBreathHub() {
  showSheet(`
    <h3>Breathwork</h3>
    <button class="opt-row" data-bw="coherence"><span class="o-ico">${brushIcon("wave","var(--c-breath)")}</span><span>Coherence · ${S.settings.coherenceRate} bpm<span class="o-sub">5–10 min · the daily default</span></span></button>
    <button class="opt-row" data-bw="box"><span class="o-ico">${brushIcon("boxbreath","var(--c-breath)")}</span><span>Box breathing 4·4·4·4<span class="o-sub">Pre-lift focus / pre-sleep wind-down</span></span></button>
    <button class="opt-row" data-bw="holds"><span class="o-ico">${brushIcon("walk","var(--c-breath)")}</span><span>Breath-hold intervals<span class="o-sub">Walking protocol · 2–3× per week</span></span></button>
    <button class="opt-row" data-bw="bolt"><span class="o-ico">${brushIcon("stopwatch","var(--c-breath)")}</span><span>BOLT test<span class="o-sub">The breathwork KPI · monthly${latestMetric("BOLT") ? ` · last: ${latestMetric("BOLT").value}s` : ""}</span></span></button>
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
function closeSheet() { cancelAnimationFrame(stickRaf); const s = $("#sheet"); if (s) s.remove(); }

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
  currentTab = t.dataset.tab;
  if (currentTab === "more") moreView = "menu";
  render();
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
  if (act === "goto-recovery") { currentTab = "more"; moreView = "recovery"; render(); }
  if (act === "more-nav") { moreView = b.dataset.view; render(); }
  if (act === "more-back") { moreView = "menu"; render(); }
  if (act === "lib-cat") { libCat = b.dataset.cat; render(); }
  if (act === "ex-detail") openExerciseSheet(b.dataset.ex);
  if (act === "open-practice") openPractice(b.dataset.open);
  if (act === "export-backup") exportBackup();
  if (act === "import-backup") importBackup();
  if (act === "log-metric") openMetricSheet(b.dataset.type);
  if (act === "toggle-gym") {
    const d = parseInt(b.dataset.day);
    S.gymDays = S.gymDays.includes(d) ? S.gymDays.filter(x => x !== d) : S.gymDays.concat([d]);
    save(); render();
  }
  if (act === "auto-schedule") autoSchedule();
  if (act === "plan-view") { planView = b.dataset.view; render(); }
  if (act === "clear-override") {
    if (b.dataset.kind === "today") S.todayOverride = null;
    else delete S.dayOverrides[b.dataset.day];
    save(); render(); toast("Back to the standard plan for that day");
  }
  if (act === "open-builder") openBuilder();
  if (act === "open-review") openWeeklyReview();
  if (act === "comeback-easy") {
    S.comebackDismissed = todayISO();
    S.weekOrder[programDay()] = "light"; save(); render();
    toast("Today is light mobility — momentum first, intensity later");
  }
  if (act === "comeback-full") { S.comebackDismissed = todayISO(); save(); render(); openLocationSheet(); }
  if (act === "comeback-restart") {
    S.comebackDismissed = todayISO();
    S.programStart = todayISO(); S.lastDeloadPrompt = null; S.deloadUntil = null;
    save(); render();
    toast("Week 1 ramp restarted — form first, load later");
  }
  if (act === "open-reminders") openReminderSheet();
  if (act === "run-custom") runCustom(b.dataset.id);
  if (act === "del-custom") {
    const w = S.customWorkouts.find(x => x.id === b.dataset.id);
    showSheet(`<h3>Delete "${esc(w ? w.name : "workout")}"?</h3>
      <button class="btn hiit" id="delc-yes">Delete</button>
      <button class="btn ghost" style="margin-top:10px;" id="delc-no">Cancel</button>`, sheet => {
      sheet.querySelector("#delc-yes").onclick = () => {
        S.customWorkouts = S.customWorkouts.filter(x => x.id !== b.dataset.id);
        save(); closeSheet(); render();
      };
      sheet.querySelector("#delc-no").onclick = closeSheet;
    });
  }
  if (act === "toggle-eq") {
    const id = b.dataset.eq;
    const had = S.equipment.includes(id);
    S.equipment = had ? S.equipment.filter(x => x !== id) : S.equipment.concat([id]);
    save(); render();
    if (!had) {
      const n = EXERCISES.filter(ex => ex.req.includes(id)).length;
      toast(`${(EQUIPMENT.find(q=>q.id===id)||{}).name} unlocked ${n} exercise${n===1?"":"s"}`);
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
  if (act === "toggle-voice") { S.settings.voice = !S.settings.voice; save(); render(); if (S.settings.voice) say("Voice guidance on"); }
  if (act === "cycle-theme") {
    const order = ["dark", "light", "auto"];
    S.settings.theme = order[(order.indexOf(S.settings.theme || "dark") + 1) % 3];
    save(); applyTheme(); render();
  }
  if (act === "cycle-rate") { S.settings.coherenceRate = S.settings.coherenceRate >= 7 ? 5 : S.settings.coherenceRate + 0.5; save(); render(); }
  if (act === "reset-all") {
    showSheet(`<h3>Reset everything?</h3><div class="meta" style="margin-bottom:14px;">All logs, metrics, and streaks will be wiped. This cannot be undone.</div>
      <button class="btn hiit" id="reset-yes">Yes, wipe it</button><button class="btn ghost" style="margin-top:10px;" id="reset-no">Cancel</button>`, sheet => {
      sheet.querySelector("#reset-yes").onclick = () => { localStorage.removeItem(DB_KEY); location.reload(); };
      sheet.querySelector("#reset-no").onclick = closeSheet;
    });
  }
});

/* ---------- tap any pattern tag for a plain-language explanation ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest(".tag");
  if (!t) return;
  const p = [...t.classList].find(c => PATTERN_EXPLAIN[c]);
  if (p) toast(PATTERN_LABEL[p] + " — " + PATTERN_EXPLAIN[p], 3800);
});

/* ---------- glass gloss: specular highlight tracks the pointer ---------- */
const GLOSS_SEL = ".card,.hero,.track-card,.ex-card,.menu-card,.slot-card,.tier-card,.opt-row,.tab,.btn,.cat-chip,.gym-toggle";
let glossEl = null;
function glossMove(e) {
  const el = e.target && e.target.closest ? e.target.closest(GLOSS_SEL) : null;
  if (glossEl && glossEl !== el) { glossEl.classList.remove("glossing"); glossEl = null; }
  if (!el) return;
  glossEl = el;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--gx", ((e.clientX - r.left) / r.width * 100).toFixed(1) + "%");
  el.style.setProperty("--gy", ((e.clientY - r.top) / r.height * 100).toFixed(1) + "%");
  el.classList.add("glossing");
}
document.addEventListener("pointermove", glossMove, { passive: true });
document.addEventListener("pointerdown", glossMove, { passive: true });
document.addEventListener("pointerup", () => {
  // on touch there's no hover — let the press highlight linger briefly, then fade
  if (glossEl) { const el = glossEl; glossEl = null; setTimeout(() => el.classList.remove("glossing"), 420); }
}, { passive: true });

/* ---------- service worker ---------- */
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

applyTheme();
render();
