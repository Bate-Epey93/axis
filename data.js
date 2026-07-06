/* ============ AXIS — plan data: equipment, exercises, templates ============ */

const EQUIPMENT = [
  // tier 1 — Foundation
  { id: "band",          name: "Resistance band",        tier: 1, unlocks: "Band push / pull / hinge everywhere" },
  { id: "gym",           name: "Gym access",             tier: 1, unlocks: "Heavy compounds (barbell, cables, machines)" },
  // tier 2 — Expanded
  { id: "pullup_bar",    name: "Pull-up bar",            tier: 2, unlocks: "True vertical pulling at home" },
  { id: "band_heavy",    name: "Heavier band set",       tier: 2, unlocks: "Raises the band progression ceiling" },
  { id: "jump_rope",     name: "Jump rope",              tier: 2, unlocks: "Cheap high-quality cardio + footwork" },
  { id: "agility_ladder",name: "Agility ladder",         tier: 2, unlocks: "Dedicated footwork / reaction drills" },
  { id: "reaction_ball", name: "Reaction ball",          tier: 2, unlocks: "Unpredictable-bounce reaction training" },
  // tier 3 — Equipped
  { id: "dumbbells",     name: "Adjustable dumbbells",   tier: 3, unlocks: "Home loaded strength, gym-independent" },
  { id: "kettlebell",    name: "Kettlebell",             tier: 3, unlocks: "Swings, carries, ballistic power" },
  { id: "rings",         name: "Gymnastics rings",       tier: 3, unlocks: "Dips, rows, muscle-up progressions" },
  { id: "mat",           name: "Mobility mat",           tier: 3, unlocks: "Proper surface for floor mobility work" },
  // tier 4 — Athlete
  { id: "hr_monitor",    name: "HR strap / watch",       tier: 4, unlocks: "Zone-guided HIIT + recovery data" },
  { id: "plyo_box",      name: "Plyo box",               tier: 4, unlocks: "Measured box jumps" },
  { id: "bench",         name: "Adjustable bench",       tier: 4, unlocks: "Full home pressing angles" },
  { id: "vest",          name: "Weight vest",            tier: 4, unlocks: "Loaded calisthenics" },
];
const TIER_NAMES = { 1: "Foundation", 2: "Expanded", 3: "Equipped", 4: "Athlete" };
const TIER_COST  = { 1: "Owned", 2: "Low cost", 3: "Medium cost", 4: "Higher cost" };

/* Band progression order, lightest → heaviest (used for load picker + progression hints) */
const BAND_ORDER = ["yellow", "red", "green", "blue", "black"];

/* Exercise library.
   req: equipment needed (empty = bodyweight). priority: higher wins when eligible.
   cue: one-line form focus, shown in the session player.
   ladder: progression steps surfaced when the user maxes the rep range. */
const EXERCISES = [
  // ---- SQUAT ----
  { id:"bb_back_squat",  name:"Barbell back squat",    pattern:"SQUAT", req:["gym"], priority:100, power:false, cue:"Brace before you descend; knees track over toes; drive the floor apart.", ladder:["+1–2 reps","+2.5–5 kg","−15 s rest"] },
  { id:"goblet_squat",   name:"Goblet squat",          pattern:"SQUAT", req:["dumbbells"], priority:80, power:false, cue:"Bell tight to chest, elbows inside knees at the bottom, chest tall.", ladder:["+reps","heavier bell","pause at bottom"] },
  { id:"kb_front_squat", name:"KB front squat",        pattern:"SQUAT", req:["kettlebell"], priority:78, power:false, cue:"Rack the bell, ribs down, sit between your heels.", ladder:["+reps","double-rack","tempo 3-1-1"] },
  { id:"band_squat",     name:"Band front squat",      pattern:"SQUAT", req:["band"], priority:60, power:false, cue:"Stand on the band, hold at shoulders; fight the band on the way up.", ladder:["+reps","slower eccentric","thicker band","1.5-rep squats"] },
  { id:"bw_squat",       name:"Bodyweight squat",      pattern:"SQUAT", req:[], priority:30, power:false, cue:"Full depth, heels down, control the descent — 3 s down, 1 s up.", ladder:["+reps","tempo 3-1-1","pause squat","pistol progression"] },
  { id:"pistol_prog",    name:"Pistol squat progression", pattern:"SQUAT", req:[], priority:35, power:false, cue:"Free leg straight out front; sit back slow; use a box until you own it.", ladder:["box pistol","assisted pistol","full pistol"] },
  // ---- HINGE ----
  { id:"bb_rdl",         name:"Romanian deadlift (barbell)", pattern:"HINGE", req:["gym"], priority:100, power:false, cue:"Push hips back, soft knees, bar drags the thighs; stop at hamstring stretch.", ladder:["+1–2 reps","+2.5–5 kg","−15 s rest"] },
  { id:"bb_deadlift",    name:"Conventional deadlift", pattern:"HINGE", req:["gym"], priority:95, power:false, cue:"Wedge in, slack out of the bar, push the floor away — never round under load.", ladder:["+reps","+load"] },
  { id:"kb_swing",       name:"Kettlebell swing",      pattern:"HINGE", req:["kettlebell"], priority:82, power:true, cue:"Snap the hips; the arms are ropes. Bell floats, glutes finish.", ladder:["+reps","heavier bell","one-arm swing"] },
  { id:"db_rdl",         name:"Dumbbell RDL",          pattern:"HINGE", req:["dumbbells"], priority:80, power:false, cue:"Hips back until hamstrings load; flat back, bells close to the legs.", ladder:["+reps","heavier","single-leg"] },
  { id:"band_rdl",       name:"Band Romanian deadlift", pattern:"HINGE", req:["band"], priority:60, power:false, cue:"Stand on the band, hinge back; squeeze glutes hard at lockout.", ladder:["+reps","slow eccentric","thicker band","single-leg band RDL"] },
  { id:"band_gm",        name:"Band good-morning",     pattern:"HINGE", req:["band"], priority:55, power:false, cue:"Band across shoulders, hinge until torso ~45°, drive hips through.", ladder:["+reps","tempo","thicker band"] },
  { id:"sl_rdl_bw",      name:"Single-leg RDL (bodyweight)", pattern:"HINGE", req:[], priority:30, power:false, cue:"Square hips, reach long, back leg and torso move as one lever.", ladder:["+reps","eyes-closed balance","add load when available"] },
  // ---- LUNGE ----
  { id:"bb_lunge",       name:"Barbell walking lunge", pattern:"LUNGE", req:["gym"], priority:90, power:false, cue:"Long step, torso tall, back knee kisses the floor.", ladder:["+reps","+load"] },
  { id:"db_split_squat", name:"DB Bulgarian split squat", pattern:"LUNGE", req:["dumbbells","bench"], priority:85, power:false, cue:"Rear foot up, front shin vertical, drop straight down.", ladder:["+reps","heavier","front-foot elevated"] },
  { id:"bw_split_squat", name:"Bulgarian split squat", pattern:"LUNGE", req:[], priority:50, power:false, cue:"Rear foot on a chair; front heel takes the weight; slow eccentric.", ladder:["+reps","tempo 3-1-1","deficit","add load"] },
  { id:"walking_lunge",  name:"Walking lunge",         pattern:"LUNGE", req:[], priority:40, power:false, cue:"Knee tracks the toes; push through the front heel to stand.", ladder:["+reps","jump lunge (week 3+)"] },
  // ---- HORIZONTAL PUSH ----
  { id:"bb_bench",       name:"Barbell bench press",   pattern:"H_PUSH", req:["gym"], priority:100, power:false, cue:"Shoulder blades pinned, feet planted, bar to lower chest, press to lockout.", ladder:["+1–2 reps","+2.5 kg","−15 s rest"] },
  { id:"db_bench",       name:"DB bench press",        pattern:"H_PUSH", req:["dumbbells","bench"], priority:88, power:false, cue:"Bells over elbows the whole path; slight arc in, no clanging at the top.", ladder:["+reps","heavier"] },
  { id:"ring_pushup",    name:"Ring push-up",          pattern:"H_PUSH", req:["rings"], priority:70, power:false, cue:"Rings turned out at top, body a rigid plank; own the wobble.", ladder:["+reps","feet elevated","ring dip"] },
  { id:"band_pushup",    name:"Band-resisted push-up", pattern:"H_PUSH", req:["band"], priority:60, power:false, cue:"Band across the back, hands anchor it; full range, hips locked.", ladder:["+reps","slower eccentric","thicker band","archer push-up"] },
  { id:"pushup",         name:"Push-up",               pattern:"H_PUSH", req:[], priority:40, power:false, cue:"One straight line ear-to-ankle; chest to floor; elbows ~45°.", ladder:["+reps","tempo","decline","archer","one-arm progression"] },
  // ---- VERTICAL PUSH ----
  { id:"bb_ohp",         name:"Overhead press (barbell)", pattern:"V_PUSH", req:["gym"], priority:100, power:false, cue:"Squeeze glutes, ribs down, press through and shrug tall at lockout.", ladder:["+reps","+2.5 kg"] },
  { id:"db_ohp",         name:"DB shoulder press",     pattern:"V_PUSH", req:["dumbbells"], priority:85, power:false, cue:"Forearms vertical, no back lean; lock out over the ears.", ladder:["+reps","heavier","single-arm"] },
  { id:"band_ohp",       name:"Band overhead press",   pattern:"V_PUSH", req:["band"], priority:60, power:false, cue:"Stand on the band; press strict — the band punishes momentum anyway.", ladder:["+reps","tempo","thicker band","single-arm"] },
  { id:"pike_pushup",    name:"Pike push-up",          pattern:"V_PUSH", req:[], priority:40, power:false, cue:"Hips high like a down-dog; head travels toward the floor between hands.", ladder:["+reps","feet elevated","wall handstand push-up progression"] },
  // ---- HORIZONTAL PULL ----
  { id:"bb_row",         name:"Barbell row",           pattern:"H_PULL", req:["gym"], priority:100, power:false, cue:"Hinge ~45°, pull to the belt line, no torso heave.", ladder:["+reps","+load"] },
  { id:"cable_row",      name:"Seated cable row",      pattern:"H_PULL", req:["gym"], priority:90, power:false, cue:"Chest up, drive elbows back, squeeze the blades — don't lean back.", ladder:["+reps","+load"] },
  { id:"ring_row",       name:"Ring row",              pattern:"H_PULL", req:["rings"], priority:75, power:false, cue:"Rigid plank, pull rings to ribs; walk feet forward to make it harder.", ladder:["+reps","feet elevated","archer row"] },
  { id:"band_row",       name:"Band row",              pattern:"H_PULL", req:["band"], priority:60, power:false, cue:"Anchor at chest height; pull to ribs, pause 1 s, resist the return.", ladder:["+reps","slow eccentric","thicker band","single-arm row"] },
  { id:"table_row",      name:"Inverted row (table/edge)", pattern:"H_PULL", req:[], priority:30, power:false, cue:"Under a sturdy table, body straight, chest to the edge.", ladder:["+reps","feet elevated"] },
  // ---- VERTICAL PULL ----
  { id:"pullup_gym",     name:"Pull-up / lat pulldown", pattern:"V_PULL", req:["gym"], priority:100, power:false, cue:"Dead hang to chin-over — full range beats extra reps. Pulldown: to collarbone.", ladder:["+reps","+load / weighted"] },
  { id:"pullup_home",    name:"Pull-up (home bar)",    pattern:"V_PULL", req:["pullup_bar"], priority:90, power:false, cue:"Shoulders down first, then pull; slow 3–5 s negatives build the strength.", ladder:["negatives","band-assisted","full","+reps","weighted (vest)"] },
  { id:"band_pulldown",  name:"Band lat pulldown",     pattern:"V_PULL", req:["band"], priority:60, power:false, cue:"Anchor high; pull elbows to ribs, feel the lats, not the arms.", ladder:["+reps","tempo","thicker band","single-arm"] },
  { id:"band_pullapart", name:"Band pull-apart",       pattern:"V_PULL", req:["band"], priority:40, power:false, cue:"Arms straight, band to chest, squeeze the blades together.", ladder:["+reps","thicker band"] },
  { id:"prone_pull",     name:"Prone Y-W-T raise",     pattern:"V_PULL", req:[], priority:20, power:false, cue:"Face down, thumbs up, lift from the mid-back — small range, big squeeze.", ladder:["+reps","add 3 s holds"] },
  // ---- CORE ----
  { id:"cable_crunch",   name:"Cable crunch",          pattern:"CORE", req:["gym"], priority:85, power:false, cue:"Hips still; crunch ribs to pelvis, exhale hard at the bottom.", ladder:["+reps","+load"] },
  { id:"ab_wheel",       name:"Ab wheel rollout",      pattern:"CORE", req:["gym"], priority:80, power:false, cue:"Tuck the pelvis, roll only as far as the low back stays flat.", ladder:["+reps","standing rollout"] },
  { id:"band_pallof",    name:"Band Pallof press",     pattern:"CORE", req:["band"], priority:65, power:false, cue:"Press out, resist the twist; ribs stacked over hips.", ladder:["+reps","longer hold","thicker band","half-kneeling"] },
  { id:"hollow_hold",    name:"Hollow-body hold",      pattern:"CORE", req:[], priority:55, power:false, cue:"Low back glued to floor; arms and legs long; breathe shallow, stay rigid.", ladder:["+10 s","rocks","V-up"] },
  { id:"plank",          name:"Plank",                 pattern:"CORE", req:[], priority:45, power:false, cue:"Squeeze glutes, tuck pelvis, push the floor away — a plank is active.", ladder:["+15 s","side plank","weighted / feet elevated"] },
  { id:"deadbug",        name:"Dead bug",              pattern:"CORE", req:[], priority:40, power:false, cue:"Opposite arm/leg lower slow; low back never leaves the floor.", ladder:["+reps","band-resisted","slower tempo"] },
  { id:"leg_raise",      name:"Lying leg raise",       pattern:"CORE", req:[], priority:42, power:false, cue:"Legs straight, lower slow, pelvis tucks at the top of each rep.", ladder:["+reps","hanging (bar)","toes-to-bar progression"] },
  // ---- CARRY ----
  { id:"farmer_gym",     name:"Farmer's carry (gym)",  pattern:"CARRY", req:["gym"], priority:90, power:false, cue:"Heavy in both hands, tall posture, quick small steps, no lean.", ladder:["+distance","+load"] },
  { id:"kb_carry",       name:"Suitcase carry (KB)",   pattern:"CARRY", req:["kettlebell"], priority:80, power:false, cue:"One side loaded; stay dead level — the obliques do the work.", ladder:["+distance","heavier","overhead carry"] },
  { id:"bw_carry",       name:"Loaded carry (backpack/any)", pattern:"CARRY", req:[], priority:30, power:false, cue:"Load a backpack or bags; walk tall, shoulders packed.", ladder:["+distance","heavier pack"] },
  // ---- PLYO / POWER ----
  { id:"box_jump",       name:"Box jump",              pattern:"PLYO", req:["plyo_box"], priority:90, power:true, cue:"Land soft and quiet, hips back; step down, never jump down.", ladder:["+height","depth drop"] },
  { id:"jump_squat",     name:"Jump squat",            pattern:"PLYO", req:[], priority:60, power:true, cue:"Max intent every rep; land like a ninja, reset, repeat. Quality over count.", ladder:["+reps","tuck jump","weighted (vest)"] },
  { id:"broad_jump",     name:"Broad jump",            pattern:"PLYO", req:[], priority:55, power:true, cue:"Big arm swing, explode forward, stick the landing for 2 s.", ladder:["+distance","consecutive jumps"] },
  { id:"plyo_pushup",    name:"Plyo push-up",          pattern:"PLYO", req:[], priority:50, power:true, cue:"Push hard enough that hands leave the floor; catch soft, elbows loaded.", ladder:["hands-leave-floor","clap push-up"] },
  { id:"skater_bound",   name:"Lateral skater bound",  pattern:"PLYO", req:[], priority:52, power:true, cue:"Bound sideways, stick one-leg landing, hold 2 s before the next.", ladder:["+distance","stick the landing 2 s"] },
  // ---- CARDIO / CONDITIONING ----
  { id:"rope_intervals", name:"Jump-rope intervals",   pattern:"CARDIO", req:["jump_rope"], priority:80, power:false, cue:"Wrists spin the rope, jumps stay low; breathe through the nose on recovery.", ladder:["+work time","double-unders"] },
  { id:"bike_sprint",    name:"Bike / rower sprints",  pattern:"CARDIO", req:["gym"], priority:85, power:false, cue:"Work interval = talk-impossible. If you can speak, go harder.", ladder:["+watts","+rounds"] },
  { id:"hill_sprint",    name:"Sprint intervals (outdoor)", pattern:"CARDIO", req:[], priority:60, power:false, cue:"Tall posture, drive the arms; walk back down as your recovery.", ladder:["+rounds","hill grade"] },
  { id:"burpee",         name:"Burpees",               pattern:"CARDIO", req:[], priority:50, power:false, cue:"Chest to floor, full hip extension at the top; find a rhythm.", ladder:["+reps per round","burpee + tuck jump"] },
  { id:"mountain_climber",name:"Mountain climbers",    pattern:"CARDIO", req:[], priority:45, power:false, cue:"Hips low, hands stacked under shoulders, drive knees fast.", ladder:["+work time","cross-body"] },
  { id:"high_knees",     name:"High knees",            pattern:"CARDIO", req:[], priority:40, power:false, cue:"Knees to hip height, stay on the balls of the feet, pump the arms.", ladder:["+work time"] },
  { id:"shadowbox",      name:"Shadowboxing rounds",   pattern:"CARDIO", req:[], priority:48, power:false, cue:"Move your feet, snap punches back fast, breathe out on every strike.", ladder:["+rounds","add level changes"] },
  // ---- REACTION ----
  { id:"reaction_ball_dr",name:"Reaction-ball drops",  pattern:"REACTION", req:["reaction_ball"], priority:85, power:false, cue:"Drop, react to the bounce, catch low — athletic stance throughout.", ladder:["single-hand catch","off-wall"] },
  { id:"ladder_drill",   name:"Agility-ladder drills", pattern:"REACTION", req:["agility_ladder"], priority:80, power:false, cue:"Eyes forward, not down; speed comes after the pattern is clean.", ladder:["new patterns","faster"] },
  { id:"wall_ball_catch",name:"Wall-ball reaction catch", pattern:"REACTION", req:[], priority:50, power:false, cue:"Throw a small ball at a wall, catch the rebound; step closer to speed it up.", ladder:["closer to wall","single hand","eyes-closed start"] },
  { id:"light_switch",   name:"Random-cue directional sprints", pattern:"REACTION", req:[], priority:45, power:false, cue:"Sprint on an external cue (timer app, partner); react, don't anticipate.", ladder:["shorter cue gap"] },
];

/* Session templates: slots reference movement patterns, never exercises. */
const TEMPLATES = {
  lower: {
    id:"lower", label:"Lower strength", type:"STRENGTH", color:"strength",
    desc:"Squat + hinge focus. Heavy if at the gym.",
    slots: [
      { pattern:"SQUAT",  target:"Quads / glutes",         rx:{ sets:3, repLo:8, repHi:12, rest:90 } },
      { pattern:"HINGE",  target:"Posterior chain",        rx:{ sets:3, repLo:8, repHi:12, rest:90 } },
      { pattern:"LUNGE",  target:"Unilateral legs",        rx:{ sets:3, repLo:8, repHi:12, rest:75 } },
      { pattern:"CORE",   target:"Anti-extension",         rx:{ sets:3, repLo:10, repHi:15, rest:60 } },
      { pattern:"CARRY",  target:"Grip / trunk",           rx:{ sets:2, repLo:30, repHi:45, rest:75, unit:"s" } },
    ],
  },
  hiit: {
    id:"hiit", label:"HIIT + Reaction", type:"CONDITIONING", color:"hiit",
    desc:"Intervals at talk-impossible effort, then reaction drills.",
    hiitDefault: { work:30, rest:90, rounds:6, prep:10 },
    slots: [
      { pattern:"CARDIO",   target:"HIIT intervals — use the timer", rx:{ sets:1, repLo:6, repHi:8, rest:0, notes:"30 s all-out / 90 s easy × 6–8" }, useHiitTimer:true },
      { pattern:"REACTION", target:"Reaction / agility (wk 3+)",     rx:{ sets:3, repLo:30, repHi:45, rest:60, unit:"s" }, week3:true },
    ],
  },
  upper: {
    id:"upper", label:"Upper strength", type:"STRENGTH", color:"strength",
    desc:"Push + pull. Heavy if at the gym.",
    slots: [
      { pattern:"H_PUSH", target:"Chest / triceps",        rx:{ sets:3, repLo:8, repHi:12, rest:90 } },
      { pattern:"V_PULL", target:"Lats / biceps",          rx:{ sets:3, repLo:6, repHi:10, rest:90 } },
      { pattern:"V_PUSH", target:"Shoulders",              rx:{ sets:3, repLo:8, repHi:12, rest:75 } },
      { pattern:"H_PULL", target:"Mid-back / posture",     rx:{ sets:3, repLo:10, repHi:12, rest:75 } },
      { pattern:"CORE",   target:"Anti-rotation",          rx:{ sets:3, repLo:10, repHi:15, rest:60 } },
    ],
  },
  zone2: {
    id:"zone2", label:"Zone-2 + Breath-hold walk", type:"CONDITIONING", color:"breath",
    desc:"Nasal-only easy cardio 30–40 min, breath-hold intervals woven in.",
    slots: [
      { pattern:"CARDIO", target:"Zone 2 — nasal breathing only", rx:{ sets:1, repLo:30, repHi:40, rest:0, unit:"min", notes:"Conversational pace. If you must mouth-breathe, slow down." } },
      { pattern:"BREATH_HOLD", target:"Breath-hold intervals",     rx:{ sets:1, repLo:5, repHi:8, rest:0, notes:"Use the breath-hold timer during the walk." }, useBreathHold:true },
    ],
  },
  power: {
    id:"power", label:"Full-body power", type:"STRENGTH", color:"strength",
    desc:"Explosive, low-rep, full recovery between efforts.",
    slots: [
      { pattern:"PLYO",   target:"Lower-body power (wk 3+)", rx:{ sets:4, repLo:3, repHi:5, rest:120 }, week3:true },
      { pattern:"H_PUSH", target:"Explosive push",           rx:{ sets:3, repLo:5, repHi:8, rest:120 } },
      { pattern:"H_PULL", target:"Fast pull",                rx:{ sets:3, repLo:6, repHi:8, rest:90 } },
      { pattern:"HINGE",  target:"Hip power",                rx:{ sets:3, repLo:6, repHi:10, rest:90 } },
      { pattern:"CORE",   target:"Trunk stiffness",          rx:{ sets:3, repLo:20, repHi:40, rest:60, unit:"s" } },
    ],
  },
  fullramp: {
    id:"fullramp", label:"Full-body (form focus)", type:"STRENGTH", color:"strength",
    desc:"Third ramp-week strength day — moderate effort, perfect reps, groove the patterns.",
    slots: [
      { pattern:"SQUAT",  target:"Pattern practice",        rx:{ sets:2, repLo:10, repHi:12, rest:75 } },
      { pattern:"H_PUSH", target:"Pattern practice",        rx:{ sets:2, repLo:10, repHi:12, rest:75 } },
      { pattern:"H_PULL", target:"Pattern practice",        rx:{ sets:2, repLo:10, repHi:12, rest:75 } },
      { pattern:"HINGE",  target:"Pattern practice",        rx:{ sets:2, repLo:10, repHi:12, rest:75 } },
      { pattern:"CORE",   target:"Foundation",              rx:{ sets:2, repLo:12, repHi:15, rest:60 } },
    ],
  },
  light: {
    id:"light", label:"Light day — deep mobility", type:"LIGHT", color:"mobility",
    desc:"Long statics, easy walk, extra breath work. This day builds litheness.",
    slots: [
      { pattern:"MOBILITY", target:"Deep static holds — use the mobility player (evening mode)", rx:{ sets:1, repLo:15, repHi:20, rest:0, unit:"min" }, useMobility:true },
      { pattern:"CARDIO",   target:"Easy nasal walk",  rx:{ sets:1, repLo:20, repHi:30, rest:0, unit:"min" } },
    ],
  },
  rest: { id:"rest", label:"Rest day", type:"REST", color:"rest", desc:"Full recovery. Protect this — it's where testosterone is made.", slots: [] },
};

/* Default week order (day index 0–6). Strength-gym days get repositioned by the scheduler. */
const WEEK_DEFAULT = ["lower","hiit","upper","zone2","power","light","rest"];

/* Weeks 1–2 ramp (plan Part 7): 3 form-focused strength days + 1 HIIT + light days.
   Plyo/reaction slots are additionally hidden by the week3 flag. */
const WEEK_RAMP = ["lower","hiit","upper","light","fullramp","light","rest"];

/* Mobility flows */
const MOBILITY_FLOWS = {
  dynamic: {
    label: "Dynamic flow (pre-workout)", secs: 300,
    moves: [
      { name:"World's Greatest Stretch — L", secs:40, cue:"Lunge, elbow to instep, rotate up" },
      { name:"World's Greatest Stretch — R", secs:40, cue:"Lunge, elbow to instep, rotate up" },
      { name:"90/90 hip switches", secs:50, cue:"Knees sweep side to side, chest tall" },
      { name:"Hip circles", secs:40, cue:"Hands on knees, big slow circles both ways" },
      { name:"Thoracic opener", secs:50, cue:"Quadruped, hand behind head, rotate open" },
      { name:"Leg swings", secs:40, cue:"Front-back then side-side, each leg" },
      { name:"Deep squat pry", secs:40, cue:"Sit in the bottom, elbows pry knees out" },
    ],
  },
  static: {
    label: "Deep static (evening / light day)", secs: 720,
    moves: [
      { name:"Couch stretch — L", secs:90, cue:"Rear foot up wall, squeeze glute, breathe slow" },
      { name:"Couch stretch — R", secs:90, cue:"Rear foot up wall, squeeze glute, breathe slow" },
      { name:"Pigeon — L", secs:90, cue:"Square hips, fold forward, exhale into it" },
      { name:"Pigeon — R", secs:90, cue:"Square hips, fold forward, exhale into it" },
      { name:"Hamstring fold", secs:90, cue:"Long spine first, then round and hang" },
      { name:"Deep squat hold", secs:60, cue:"Heels down, chest tall, relax at the bottom" },
      { name:"Chest doorway stretch", secs:60, cue:"Forearm on frame, lean through" },
      { name:"Child's pose + side reach", secs:80, cue:"Walk hands left, breathe; then right" },
    ],
  },
};

/* Onboarding baseline metrics */
const BASELINES = [
  { type:"BOLT", label:"BOLT score", unit:"s", hint:"Use the BOLT test in Breathwork" },
  { type:"WAIST", label:"Waist", unit:"cm", hint:"At the navel, relaxed" },
  { type:"BODYWEIGHT", label:"Bodyweight", unit:"kg", hint:"Morning, before eating" },
  { type:"BENCHMARK", label:"Max push-ups", unit:"reps", hint:"One clean set to failure" },
];

const METRIC_DEFS = {
  BOLT:       { label:"BOLT score",  unit:"s",   color:"#30D5C8", goodDir: 1, note:"The breathwork KPI. Re-test monthly, rested, seated." },
  WAIST:      { label:"Waist",       unit:"cm",  color:"#FF6230", goodDir:-1, note:"Primary recomposition metric. The scale can stall while the waist shrinks — muscle in, fat out." },
  BODYWEIGHT: { label:"Bodyweight",  unit:"kg",  color:"#9A9AA2", goodDir: 0, note:"Secondary. Expect noise; judge on 8–12 week trends." },
  LIFT_SQUAT: { label:"Squat",       unit:"kg",  color:"#FF6230", goodDir: 1, note:"" },
  LIFT_HINGE: { label:"Deadlift/RDL",unit:"kg",  color:"#FFB340", goodDir: 1, note:"" },
  LIFT_PUSH:  { label:"Bench/Push",  unit:"kg",  color:"#5E9CF5", goodDir: 1, note:"" },
  LIFT_PULL:  { label:"Pull",        unit:"kg",  color:"#30D5C8", goodDir: 1, note:"" },
  BENCHMARK:  { label:"Max push-ups",unit:"reps",color:"#30DB5B", goodDir: 1, note:"Monthly benchmark set." },
};

const PATTERN_LABEL = {
  SQUAT:"Squat", HINGE:"Hinge", H_PUSH:"Horizontal push", V_PUSH:"Vertical push",
  H_PULL:"Horizontal pull", V_PULL:"Vertical pull", LUNGE:"Lunge", CARRY:"Carry",
  CORE:"Core", PLYO:"Power / plyo", CARDIO:"Cardio", REACTION:"Reaction",
  MOBILITY:"Mobility", BREATH_HOLD:"Breath-hold",
};
