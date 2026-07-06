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
    id:"lower", label:"Lower body strength", type:"STRENGTH", color:"strength",
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
    id:"upper", label:"Upper body strength", type:"STRENGTH", color:"strength",
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

/* Library categories — human groupings, not movement-pattern jargon */
const CATEGORIES = [
  { id:"lower",   label:"Lower body",     patterns:["SQUAT","HINGE","LUNGE"],               color:"strength" },
  { id:"upper",   label:"Upper body",     patterns:["H_PUSH","V_PUSH","H_PULL","V_PULL"],   color:"mobility" },
  { id:"core",    label:"Core",           patterns:["CORE","CARRY"],                        color:"pelvic" },
  { id:"power",   label:"Power & speed",  patterns:["PLYO","REACTION"],                     color:"hiit" },
  { id:"cardio",  label:"Conditioning",   patterns:["CARDIO"],                              color:"hiit" },
  { id:"pelvic",  label:"Pelvic floor",   practice:"pelvic",                                color:"pelvic" },
  { id:"breath",  label:"Breathwork",     practice:"breath",                                color:"breath" },
  { id:"mobility",label:"Mobility",       practice:"mobility",                              color:"mobility" },
  { id:"mind",    label:"Meditation",     practice:"mind",                                  color:"mind" },
];

/* Guided practices shown in the Library alongside exercises */
const PRACTICES = [
  { id:"pf_session",  cat:"pelvic",   name:"Pelvic floor session",  sub:"3 sets · slow holds + quick flicks · ~4 min", color:"pelvic",   open:"pelvic" },
  { id:"coherence",   cat:"breath",   name:"Coherence breathing",   sub:"5s in / 5s out · the daily default",          color:"breath",   open:"coherence" },
  { id:"box",         cat:"breath",   name:"Box breathing",         sub:"4·4·4·4 · pre-lift focus / wind-down",        color:"breath",   open:"box" },
  { id:"holds",       cat:"breath",   name:"Breath-hold walk",      sub:"Exhale-hold intervals · 2–3× a week",         color:"breath",   open:"holds" },
  { id:"bolt",        cat:"breath",   name:"BOLT test",             sub:"The breathwork KPI · re-test monthly",        color:"breath",   open:"bolt" },
  { id:"mob_dynamic", cat:"mobility", name:"Dynamic flow",          sub:"5 min · pre-workout",                          color:"mobility", open:"mob_dynamic" },
  { id:"mob_static",  cat:"mobility", name:"Deep static flow",      sub:"12 min · evening / light day only",            color:"mobility", open:"mob_static" },
  { id:"meditation",  cat:"mind",     name:"Solar-plexus meditation", sub:"7 min · hand on abdomen · ~6 breaths/min",   color:"mind",     open:"meditation" },
];

const PATTERN_LABEL = {
  SQUAT:"Squat", HINGE:"Hinge", H_PUSH:"Horizontal push", V_PUSH:"Vertical push",
  H_PULL:"Horizontal pull", V_PULL:"Vertical pull", LUNGE:"Lunge", CARRY:"Carry",
  CORE:"Core", PLYO:"Power / plyo", CARDIO:"Cardio", REACTION:"Reaction",
  MOBILITY:"Mobility", BREATH_HOLD:"Breath-hold",
};

/* Exercise knowledge base: what it is / why it matters, and the muscles it hits.
   Kept separate from EXERCISES so the engine data stays lean. */
const EX_INFO = {
  bb_back_squat:  { desc:"The king of lower-body lifts — a barbell across the upper back, sitting down and standing up under load. Builds total leg mass, bone density, and the biggest testosterone response of any single movement.", primary:["Quads","Glutes"], secondary:["Hamstrings","Spinal erectors","Core"] },
  goblet_squat:   { desc:"A squat holding one dumbbell at the chest. The counterweight teaches perfect upright squat form while loading the legs — the best-value loaded squat outside a rack.", primary:["Quads","Glutes"], secondary:["Core","Upper back"] },
  kb_front_squat: { desc:"Squatting with a kettlebell racked at the shoulder. The offset load forces the trunk to brace hard, making it a leg and core builder in one.", primary:["Quads","Glutes"], secondary:["Core","Upper back"] },
  band_squat:     { desc:"A squat against band tension that increases as you stand — hardest at lockout, where you're strongest. Keeps legs progressing anywhere there's a band.", primary:["Quads","Glutes"], secondary:["Hamstrings","Core"] },
  bw_squat:       { desc:"The unloaded movement pattern every leg exercise is built on. With tempo and depth it maintains leg muscle, mobility, and work capacity with zero equipment.", primary:["Quads","Glutes"], secondary:["Hamstrings","Calves"] },
  pistol_prog:    { desc:"A full squat on one leg. The endgame of bodyweight leg strength — equal parts strength, balance, and ankle/hip mobility, which is why it doubles as litheness work.", primary:["Quads","Glutes"], secondary:["Core","Ankle stabilizers"] },
  bb_rdl:         { desc:"A hip hinge with the barbell sliding down the thighs — the purest hamstring and glute loader. The posterior chain it builds drives sprinting, jumping, and pelvic drive.", primary:["Hamstrings","Glutes"], secondary:["Spinal erectors","Grip"] },
  bb_deadlift:    { desc:"Lifting a barbell from the floor — the heaviest thing you'll do in a gym. Full-body strength, dense posterior chain, and a potent hormonal stimulus.", primary:["Glutes","Hamstrings","Spinal erectors"], secondary:["Lats","Traps","Grip","Core"] },
  kb_swing:       { desc:"A ballistic hip snap that floats the bell — power and conditioning in one movement. Trains the hips to produce force fast, which transfers everywhere.", primary:["Glutes","Hamstrings"], secondary:["Core","Shoulders","Grip"] },
  db_rdl:         { desc:"The hip hinge with dumbbells — same hamstring/glute loading as the barbell version with a longer range and easier setup at home.", primary:["Hamstrings","Glutes"], secondary:["Spinal erectors","Grip"] },
  band_rdl:       { desc:"The hip hinge against a band. Peak tension arrives at lockout where the glutes finish — a glute-squeeze teacher and a hinge you can do anywhere.", primary:["Glutes","Hamstrings"], secondary:["Spinal erectors"] },
  band_gm:        { desc:"A hinge with the band across the shoulders. Longer lever than the RDL, so lighter tension hits the hamstrings harder — a great band-only hamstring finisher.", primary:["Hamstrings","Spinal erectors"], secondary:["Glutes"] },
  sl_rdl_bw:      { desc:"A one-leg hinge reaching long. Trains balance and hip stability along with hamstrings — the single best warm-up drill for the posterior chain, and honest about left-right gaps.", primary:["Hamstrings","Glutes"], secondary:["Ankle stabilizers","Core"] },
  bb_lunge:       { desc:"Walking lunges under a barbell — brutal single-leg volume that builds legs and lungs together, and irons out left-right imbalances heavy squats hide.", primary:["Quads","Glutes"], secondary:["Hamstrings","Core"] },
  db_split_squat: { desc:"Rear foot elevated, dumbbells in hand — the hardest-hitting single-leg lift there is. Quads and glutes take everything; balance keeps the core honest.", primary:["Quads","Glutes"], secondary:["Hamstrings","Core"] },
  bw_split_squat: { desc:"The rear-foot-elevated split squat with bodyweight. Slow tempo makes it a serious quad/glute builder with just a chair — and stretches the hip flexors while it works.", primary:["Quads","Glutes"], secondary:["Hip flexors (stretch)","Core"] },
  walking_lunge:  { desc:"Continuous alternating lunges. Trains legs one at a time through full range — strength, balance, and hip mobility in one no-equipment package.", primary:["Quads","Glutes"], secondary:["Hamstrings","Calves"] },
  bb_bench:       { desc:"The classic barbell press from the chest. The heaviest upper-body push available — chest, shoulders, and triceps under maximum load.", primary:["Chest","Triceps"], secondary:["Front delts","Core"] },
  db_bench:       { desc:"Pressing dumbbells from a bench. A longer range than the bar and each side works alone — more chest stretch, fewer imbalances.", primary:["Chest","Triceps"], secondary:["Front delts","Stabilizers"] },
  ring_pushup:    { desc:"Push-ups on unstable rings. The wobble recruits everything from wrists to core, and rings scale from easy to brutal by foot position alone.", primary:["Chest","Triceps"], secondary:["Core","Shoulder stabilizers"] },
  band_pushup:    { desc:"A push-up with a band across the back adding resistance at the top — turns the humble push-up back into a strength exercise once reps get easy.", primary:["Chest","Triceps"], secondary:["Front delts","Core"] },
  pushup:         { desc:"The fundamental horizontal push — a moving plank that builds chest, arms, and trunk stiffness at once. Infinite variations mean it never stops scaling.", primary:["Chest","Triceps"], secondary:["Front delts","Core"] },
  bb_ohp:         { desc:"Pressing a barbell strictly overhead. The honest measure of upper-body strength — shoulders and triceps with the whole trunk bracing underneath.", primary:["Shoulders","Triceps"], secondary:["Upper chest","Core"] },
  db_ohp:         { desc:"Overhead pressing with dumbbells. Each arm stabilizes its own load — healthier for the shoulder joint and merciless about weak sides.", primary:["Shoulders","Triceps"], secondary:["Traps","Core"] },
  band_ohp:       { desc:"An overhead press against band tension. Smooth resistance that peaks at lockout — shoulder strength you can train in a hotel room.", primary:["Shoulders","Triceps"], secondary:["Traps","Core"] },
  pike_pushup:    { desc:"A push-up with hips high, pressing your own bodyweight toward vertical. The bridge from push-ups to handstand work — shoulders take over from chest.", primary:["Shoulders","Triceps"], secondary:["Upper chest","Core"] },
  bb_row:         { desc:"Rowing a barbell to the waist from a hinge. Builds the entire back — thickness, posture, and the pulling strength that balances all your pressing.", primary:["Lats","Mid-back"], secondary:["Rear delts","Biceps","Spinal erectors"] },
  cable_row:      { desc:"Seated rowing on a cable stack. Constant tension through the full stroke — the cleanest way to feel the shoulder blades do the work.", primary:["Lats","Mid-back"], secondary:["Rear delts","Biceps"] },
  ring_row:       { desc:"A row hanging under rings. The bodyweight pull that scales from beginner to brutal by walking your feet forward — the pulling twin of the push-up.", primary:["Lats","Mid-back"], secondary:["Biceps","Core"] },
  band_row:       { desc:"Rowing against a band anchor. The home staple that keeps pull volume up between gym days — posture insurance for desk hours too.", primary:["Lats","Mid-back"], secondary:["Rear delts","Biceps"] },
  table_row:      { desc:"Rowing your body under a sturdy table edge. The zero-equipment horizontal pull — proof there's never an excuse to skip pulling.", primary:["Lats","Mid-back"], secondary:["Biceps","Core"] },
  pullup_gym:     { desc:"Chin over bar or lat pulldown — vertical pulling under real load. Builds the V-taper, grip, and the lat strength that protects shoulders overhead.", primary:["Lats"], secondary:["Biceps","Mid-back","Grip","Core"] },
  pullup_home:    { desc:"The pull-up on your own bar. Bodyweight's flagship pull — negatives and band assists build it rep by rep until you own the movement.", primary:["Lats"], secondary:["Biceps","Mid-back","Grip","Core"] },
  band_pulldown:  { desc:"A lat pulldown against a high-anchored band. Keeps vertical pulling trained at home until a bar (or the gym) is available.", primary:["Lats"], secondary:["Biceps","Rear delts"] },
  band_pullapart: { desc:"Pulling a band apart at chest height. Small move, big payoff — rear delts and mid-back that undo sitting posture and armor the shoulders.", primary:["Rear delts","Mid-back"], secondary:["Traps"] },
  prone_pull:     { desc:"Face-down Y-W-T raises. Tiny range, zero equipment, and it wakes up every scapular muscle that slouching puts to sleep.", primary:["Mid-back","Rear delts"], secondary:["Rotator cuff"] },
  cable_crunch:   { desc:"A kneeling crunch against the cable stack — the rare ab exercise you can load progressively heavy, which is what makes abs actually grow.", primary:["Rectus abdominis"], secondary:["Obliques"] },
  ab_wheel:       { desc:"Rolling out on a wheel and pulling back. Anti-extension core strength at its most intense — the trunk fights the stretch the whole way.", primary:["Rectus abdominis","Deep core"], secondary:["Lats","Obliques"] },
  band_pallof:    { desc:"Pressing a band out and refusing to rotate. Anti-rotation is what the core actually does in life and sport — this trains it directly.", primary:["Obliques","Deep core"], secondary:["Glutes","Shoulders"] },
  hollow_hold:    { desc:"The gymnast's core position — low back pressed down, body rigid. Teaches the whole-body tension that carries into every lift and calisthenic skill.", primary:["Rectus abdominis","Deep core"], secondary:["Hip flexors","Quads"] },
  plank:          { desc:"The isometric trunk hold. Done actively — glutes squeezed, floor pushed away — it builds the bracing endurance that protects the spine under everything else.", primary:["Deep core","Rectus abdominis"], secondary:["Shoulders","Glutes"] },
  deadbug:        { desc:"Opposite arm and leg lowering while the back stays glued down. The gentlest serious core drill — coordination and deep-core control without any strain.", primary:["Deep core"], secondary:["Hip flexors","Obliques"] },
  leg_raise:      { desc:"Lowering straight legs under control. Hits the stubborn lower abdominal region and builds toward hanging raises and toes-to-bar.", primary:["Lower abs","Hip flexors"], secondary:["Obliques"] },
  farmer_gym:     { desc:"Walking with heavy weight in both hands. The simplest full-body exercise there is — grip, traps, core, and posture all fail before your legs do.", primary:["Grip","Traps","Core"], secondary:["Shoulders","Glutes"] },
  kb_carry:       { desc:"Carrying one heavy bell on a single side. The lopsided load makes the obliques fight for every step — anti-lean core work disguised as a walk.", primary:["Obliques","Grip"], secondary:["Traps","Shoulders","Glutes"] },
  bw_carry:       { desc:"A loaded walk with whatever's heavy — backpack, groceries, anything. Keeps the carry pattern trained with zero dedicated equipment.", primary:["Grip","Core"], secondary:["Traps","Legs"] },
  box_jump:       { desc:"Jumping onto a box. Maximal hip power with a soft, measured landing — the safest way to train explosive leg drive and track it by height.", primary:["Glutes","Quads"], secondary:["Calves","Hamstrings"] },
  jump_squat:     { desc:"A squat that leaves the ground. Converts leg strength into speed — the fast-twitch work that keeps you athletic, not just strong.", primary:["Quads","Glutes"], secondary:["Calves","Core"] },
  broad_jump:     { desc:"A maximal jump forward. Horizontal power — the hip extension pattern of sprinting, measurable to the centimeter.", primary:["Glutes","Hamstrings"], secondary:["Quads","Calves"] },
  plyo_pushup:    { desc:"A push-up explosive enough that the hands leave the floor. Upper-body power — teaches the chest and triceps to fire fast, not just hard.", primary:["Chest","Triceps"], secondary:["Front delts","Core"] },
  skater_bound:   { desc:"Bounding sideways from leg to leg, sticking each landing. Lateral power and ankle/knee stability — the plane most training forgets.", primary:["Glutes","Quads"], secondary:["Ankle stabilizers","Adductors"] },
  rope_intervals: { desc:"Jump rope in work/rest intervals. Elite-level conditioning, footwork, and calf endurance for the price of a coffee.", primary:["Calves","Cardio system"], secondary:["Shoulders","Forearms","Core"] },
  bike_sprint:    { desc:"All-out sprints on a bike or rower. Maximum-intensity conditioning with zero impact — the cleanest way to hit true HIIT effort safely.", primary:["Cardio system","Quads"], secondary:["Glutes","Hamstrings"] },
  hill_sprint:    { desc:"Sprinting, ideally uphill. The most bang-for-buck conditioning there is — power, lungs, and hormones in under ten total minutes of work.", primary:["Cardio system","Glutes","Hamstrings"], secondary:["Quads","Calves","Core"] },
  burpee:         { desc:"Floor to standing jump, repeat. The everywhere-conditioning move — full-body, no equipment, impossible to do slowly and easy.", primary:["Cardio system"], secondary:["Chest","Quads","Core"] },
  mountain_climber:{ desc:"Running the knees under a plank. Conditioning plus core — keeps the heart rate up while the trunk holds the line.", primary:["Cardio system","Core"], secondary:["Hip flexors","Shoulders"] },
  high_knees:     { desc:"Sprinting in place, knees to hip height. A no-space conditioning drill that doubles as sprint-form practice.", primary:["Cardio system","Hip flexors"], secondary:["Calves","Core"] },
  shadowbox:      { desc:"Boxing rounds against the air. Conditioning, coordination, and reaction rolled together — and the best-feeling cardio in the plan.", primary:["Cardio system","Shoulders"], secondary:["Core","Calves"] },
  reaction_ball_dr:{ desc:"Dropping a six-sided ball and catching its unpredictable bounce. Pure reaction-time training — the eyes-to-hands loop gets measurably faster.", primary:["Reaction time","Hand-eye coordination"], secondary:["Ankle stabilizers"] },
  ladder_drill:   { desc:"Fast feet through ladder rungs. Foot speed and movement patterns that transfer to every sport — and a sneaky conditioning hit.", primary:["Foot speed","Coordination"], secondary:["Calves","Cardio system"] },
  wall_ball_catch:{ desc:"Throwing a small ball at a wall and catching the rebound. DIY reaction training — closer and faster as you improve.", primary:["Reaction time","Hand-eye coordination"], secondary:["Shoulders"] },
  light_switch:   { desc:"Sprinting on an unpredictable external cue. Trains the react-then-move sequence — decision speed, not just foot speed.", primary:["Reaction time","Acceleration"], secondary:["Glutes","Calves"] },
};

/* Custom-workout timer modes */
const WORKOUT_MODES = {
  sets:      { label:"Sets × reps", hint:"Classic strength — log every set", cfg:{ sets:3, repLo:8, repHi:12, rest:90 } },
  hiit:      { label:"HIIT",        hint:"Work hard / recover, repeat",      cfg:{ work:30, rest:90, rounds:6 } },
  tabata:    { label:"Tabata",      hint:"20 s on / 10 s off × 8",           cfg:{ work:20, rest:10, rounds:8 } },
  emom:      { label:"EMOM",        hint:"Every minute on the minute",       cfg:{ minutes:10 } },
  amrap:     { label:"AMRAP",       hint:"As many rounds as possible",       cfg:{ minutes:12 } },
  rounds:    { label:"Rounds",      hint:"Circuit — rest between rounds",    cfg:{ rounds:3, rest:60 } },
  stopwatch: { label:"Stopwatch",   hint:"Free timing, just a clock",        cfg:{} },
};

/* Pairing brain: which patterns complement which (antagonists + non-competing) */
const PATTERN_PAIRS = {
  H_PUSH:["H_PULL","V_PULL","CORE"], V_PUSH:["V_PULL","H_PULL","CORE"],
  H_PULL:["H_PUSH","V_PUSH","CORE"], V_PULL:["V_PUSH","H_PUSH","CORE"],
  SQUAT:["HINGE","CORE","H_PULL"],   HINGE:["SQUAT","H_PUSH","CORE"],
  LUNGE:["CORE","H_PULL","H_PUSH"],  CARRY:["CORE","SQUAT"],
  CORE:["CARDIO","CARRY","SQUAT"],   PLYO:["CORE","H_PULL"],
  CARDIO:["CORE","H_PULL"],          REACTION:["PLYO","CARDIO"],
};

/* Plain-language explainers for movement patterns — shown when a tag is tapped */
const PATTERN_EXPLAIN = {
  SQUAT:"sit down and stand back up under control",
  HINGE:"bend at the hips with a flat back — how you pick things up safely",
  H_PUSH:"push away from your chest, like a push-up",
  V_PUSH:"push straight overhead",
  H_PULL:"row toward your body — balances all the pushing",
  V_PULL:"pull down from overhead, like a pull-up",
  LUNGE:"one leg forward, one back — legs working separately",
  CARRY:"walk while holding weight — grip and posture",
  CORE:"trunk muscles holding steady while you move",
  PLYO:"explosive jumps and throws — trains speed",
  CARDIO:"gets the heart rate up",
  REACTION:"react fast to something unpredictable",
  MOBILITY:"stretching and moving joints through full range",
  BREATH_HOLD:"controlled breath holds that build CO2 tolerance",
};
