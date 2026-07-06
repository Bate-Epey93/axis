# Axis — Personal Peak-Condition App

A single-user, offline-first PWA implementing the Peak-Condition Protocol: 6-day equipment-aware training, breathwork, pelvic floor, mobility, meditation, and progress metrics. No build step, no dependencies — plain HTML/CSS/JS.

## Install on your phone

1. Serve this folder over HTTPS (or localhost). Easiest options:
   - **GitHub Pages / Netlify / Vercel** — drop the folder in, done.
   - On your Mac for same-Wi-Fi testing: `npx http-server axis -p 8741` then open `http://<your-mac-ip>:8741` on the phone (note: service worker/install requires HTTPS except on localhost).
2. Open the URL in Safari (iOS) or Chrome (Android).
3. **iOS:** Share → *Add to Home Screen*. **Android:** menu → *Install app*.
4. After the first load it works fully offline (gym basements, airplanes). Updates are picked up automatically next time you're online.

All data lives in `localStorage` on the device — private, local-only. "Reset all data" is under the Recovery tab.

## What's inside

| File | Role |
|---|---|
| `index.html` | Shell: tab bar, rest-timer bar, toast |
| `styles.css` | Design system — dark FitBod-style UI, domain color coding |
| `data.js` | Exercise library (60+, equipment-tagged), 6-day session templates, equipment tiers, mobility flows |
| `app.js` | Substitution engine, progression rules, deload/rest-day logic, all timers, charts, storage |
| `sw.js` | Network-first service worker (offline fallback) |
| `manifest.webmanifest` + icons | PWA install metadata |

## Color code

- 🟠 Orange — strength / lifts · 🔴 Red — HIIT / power · 🟢 Teal — breathwork
- 🔵 Blue — mobility · 🟣 Purple — pelvic floor · 🟡 Yellow — meditation · 🟩 Green — nutrition / done

## Core behaviors

- **Session start asks "Where are you today?"** (gym / home / travel) and fills every movement slot with the best eligible exercise. Every slot has a bodyweight fallback — a session is always completable.
- **Progression:** hit the top of the rep range on all sets → next step of that exercise's ladder is suggested. Miss the bottom on 2+ sets → hold/regress + fatigue flag.
- **Rest timer** auto-starts on set completion; power/plyo movements enforce ≥120 s full recovery.
- **Restraint:** 6 hard days in a row triggers a warning + one-tap swap to light mobility; deload (−40% volume) is prompted every ~5 weeks and auto-applied to prescriptions.
- **Weeks 1–2 ramp:** plyo/reaction slots hidden until week 3.
- **Equipment tiers:** toggle "I got this" and the exercise pool expands instantly; a next-buy recommendation points at your current ceiling.
