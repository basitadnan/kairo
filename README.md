# Kairo

A local-first university command center. One React + TypeScript codebase running as a
**Windows app (Electron)**, an **Android app (Capacitor)**, and in the browser for development.
Data lives in IndexedDB on each device; **Convex** mirrors changes between them.
The AI layer (photo/PDF import, natural-language quick-add, an assistant that reads your
live data) runs behind a provider-agnostic adapter — Mock provider built in, Gemini /
OpenAI / Anthropic with your own key.

Design direction: "Soft Editorial" — warm bone canvas, hairline borders, muted pastel
category chips, Newsreader serif accents. Source of truth:
`design-system/mega-schedule/MASTER.md`.

## Development

```bash
npm install
npm run dev            # browser at http://localhost:5173
npm run electron:dev   # desktop shell with hot reload
```

## Production

```bash
npm run electron:build   # Windows installer in release/
npm run build            # web assets in dist/ (also what Capacitor wraps)
```

### Android (needs Android Studio + SDK)

```bash
npm i -D @capacitor/android
npx cap add android
npm run build && npx cap copy
npx cap open android   # build/run from Android Studio or CLI
```

## Convex setup (5 minutes)

1. Run `npx convex dev` — it opens your browser: create/log into a Convex account
   (free tier is plenty) and create a project. This pushes `convex/schema.ts` +
   `convex/sync.ts` and prints a deployment URL like `https://your-project.convex.cloud`.
2. In Kairo → Settings → **Cloud sync**: paste the deployment URL.
   - First device: press **Create pairing key** — this claims the cloud namespace.
   - Other devices: paste that same pairing key → **Save & test**.

Sync model: document-style (`syncDocs` table), last-write-wins on `updatedAt`
enforced server-side *and* client-side, soft deletes propagate, one flat
namespace owned by your pairing key. Only the key's SHA-256 ever reaches the
cloud; devices keep the raw key locally. Works fully offline; syncs
opportunistically on launch, edit, focus and every 60 s.

## Features

- **Dashboard** — next-up countdown, today's classes with one-tap attendance marking
  (present / late / absent / cancelled), due-soon tasks, exam countdowns.
- **Timetable** — weekly grid of recurring class slots with semester date ranges.
- **Courses & GPA** — full course editing (name, code, colour), credits and percentage
  marks; GPA computed through an editable grading-band table (Settings → Grading).
- **Attendance** — per-course attended percentages and a correctable history.
- **Tasks / Personal** — full create/edit/delete everywhere.
- **Import** — photo or PDF (pdf.js) → AI parses an exam schedule/timetable →
  side-by-side review table → confirm into your data. Corrections are stored locally.
- **Assistant** — chat grounded in your live classes, tasks, exams, attendance and marks.
- **Notifications** — desktop: tray-resident Electron with web notifications and a 30 s
  engine. Android: reminders are registered ahead of time as **exact alarms** so they
  fire even when the process is killed; POST_NOTIFICATIONS + exact-alarm permissions are
  handled in-app, with a battery-optimisation guide in Settings.
- **Android widget** — home-screen "Today" widget (next classes + exam countdown),
  fed by a snapshot from the app.
- **Data** — JSON backup + restore, CSV export per dataset (tasks/exams/timetable/personal).
- Dark mode first-class; `prefers-reduced-motion` honoured throughout.

## Roadmap status

- Phase 0 — skeleton, design system, Dexie schema, Convex pairing-key sync ✅
- Phase 1 — foundation: full CRUD, dashboard, timetable, notifications, settings, export ✅
- Phase 2 — AI: document import with review flow, natural-language quick-add, assistant ✅
- Phase 3 — attendance ✅ · GPA tracker ✅ · Android widget ✅
