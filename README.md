# Semester Project Manager

A desktop planner for students running a semester or bachelor project with **SCRUM inside the
Unified Process**.

You tell it two things — when the project is due, and when you can realistically work — and it lays
out the whole thing on your actual calendar: UP phases, sprints inside them, ceremonies booked into
your real free slots, gate milestones, deliverable due dates, and an honest running answer to *am I
going to make it?*

Everything is stored in a single local SQLite file. No account, no server, no telemetry.

---

## Why this exists

Students are handed a deadline and a methodology, and then left to work out the schedule
themselves. The usual result is three weeks lost in Inception, an architecture document remembered
in week 10, and a final fortnight spent writing the report that should have been written along the
way.

This app does the scheduling part properly:

- **It plans against real time, not calendar time.** If you can work Tuesday and Thursday evenings
  plus Saturday mornings, that is 10 hours a week — not 168. Every capacity figure comes from a
  weekly grid you paint yourself, minus your exam weeks and holidays.
- **It subtracts Scrum overhead.** Sprint planning, review and retrospective are booked into your
  actual free slots, and the hours they consume are removed from the time you have left to build.
  The number the app shows you is what remains.
- **It knows what UP expects.** Vision document before LCO, architecture document and an executable
  skeleton before LCA, test report before IOC, report and release before Product Release — dated
  against the gate they belong to, on a day you actually work.
- **It tells you the truth.** If 15 ECTS implies ~405 hours and your grid adds up to 120, it says
  so before you start, not in week 12.

## What it does

| | |
|---|---|
| **Setup wizard** | Dates, a paint-by-drag weekly availability grid, exam blackouts, sprint length and phase ratios — with a plan preview that recomputes as you type. |
| **Roadmap** | The whole project on one timeline: phase ribbons, sprints, weekly capacity, gate milestones, deadlines and a line for today. |
| **Calendar** | Month / week / day / list. Ceremonies sit inside your declared working time; shaded blocks are the hours left to build in. Exports to `.ics`. |
| **Sprint board** | To do / In progress / Done, with committed hours shown against the sprint's real net capacity. |
| **Backlog** | Estimates in both story points and hours, assignable to sprints, with a per-sprint load summary. |
| **UP deliverables** | Every artifact grouped by phase and discipline, with due dates and gate checklists. |
| **Progress** | Sprint burndown, velocity, available-vs-logged hours, and a slack figure that says whether the work left fits the time left. |

### How SCRUM and UP fit together

The Unified Process supplies the **phases** and their **gate milestones**; SCRUM supplies the
**sprints** that run inside them.

```
Inception ──────► LCO   Elaboration ──────► LCA   Construction ──────► IOC   Transition ──────► PR
  Sprint 1               Sprint 2  Sprint 3        Sprint 4 … Sprint 6        Sprint 7
```

Phases are measured in whole sprints, so a sprint always belongs to exactly one phase. The default
split is the classic UP effort profile — Inception 10%, Elaboration 30%, Construction 50%,
Transition 10% — and every phase is guaranteed at least one full sprint. If the timeline is too
short for four distinct phases, phases are **merged** rather than dropped, and the merged phase
inherits the deliverables of everything it absorbed.

## Download

Grab the installer for your machine from the
**[latest release](https://github.com/Ghiyathali/Semester-project-manager-/releases/latest)**:

| Platform | File |
|---|---|
| Windows 10/11 | `…-windows-x64-setup.exe` |
| macOS (Apple Silicon) | `…-macos-arm64.dmg` |
| macOS (Intel) | `…-macos-x64.dmg` |

The builds are not code-signed, so each platform asks once whether you trust it:

- **Windows** — SmartScreen says "Windows protected your PC": **More info → Run anyway**.
- **macOS** — first launch needs **right-click → Open → Open**, not a double-click. If it still
  refuses: `xattr -dr com.apple.quarantine "/Applications/Semester Project Manager.app"`.

**Linux** has no prebuilt download — the packaging step does not currently work on the CI runner.
The app itself runs on Linux, so you can build your own with `npm install && npm run build:linux`.

## Build it yourself

```bash
git clone https://github.com/Ghiyathali/Semester-project-manager-.git
cd Semester-project-manager-
npm install
npm run dev
```

Requires Node 20 or newer. There is no native module to compile — SQLite runs as WebAssembly, so
`npm install` works on Windows, macOS and Linux without any build toolchain.

### Building installers

`npm run build:win`, `build:mac` and `build:linux` each write to `release/`. Electron apps do not
cross-package reliably, so building for a platform has to happen on that platform — which is why
the release workflow uses one runner per platform.

### Cutting a release

Pushing a version tag builds the Windows and macOS installers and attaches them to a GitHub
release automatically:

```bash
npm version 0.2.0 --no-git-tag-version
git commit -am "Release 0.2.0"
git tag v0.2.0
git push && git push --tags
```

## Working on it

```bash
npm run dev        # the Electron app, with hot reload
npm run dev:web    # the UI alone in a browser, backed by an in-memory demo project
npm test           # scheduler unit tests + database integration tests
npm run typecheck  # both TypeScript projects
npm run lint
```

`npm run dev:web` is the quickest loop for UI work: it serves the renderer on
<http://localhost:5180> with a mock backend seeded with a half-finished project, so the charts and
timelines have real-looking data without launching the desktop shell.

### How the code is laid out

```
src/
  core/        Pure TypeScript. The scheduler lives here and imports nothing from
               Electron, Node or React - which is why it is fully unit-tested and
               why the renderer can reuse it directly.
    scheduler/   availability -> sprints -> phases -> ceremonies -> validation
    up/          UP deliverable templates, phase goals, starter backlog
  main/        Electron main process: SQLite, repositories, IPC handlers, exports
  preload/     The context-isolated bridge; an allowlist of IPC channels
  renderer/    React UI
  shared/      Types and the IPC contract shared across the process boundary
```

Two conventions worth knowing before you change anything:

**Time is wall-clock.** Dates are `YYYY-MM-DD` strings and times are `HH:MM` strings, and the
scheduler never converts to UTC. "Tuesday 18:00–21:00" means three hours as the student experiences
them, on both sides of a daylight-saving change. Absolute instants only appear at the edges, in the
`.ics` export — which deliberately writes floating local times.

**Generated rows remember whether you touched them.** Plan rows carry `is_generated` and
`is_user_modified`. Re-planning rewrites the generated rows you have not edited and leaves the ones
you have, so changing your availability in week 6 never deletes the sprint goal you wrote in week 2.
A re-plan always shows a diff before it writes anything.

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports about scheduling are much easier to act on with
a JSON export attached (Settings → Export this project) — it makes the plan reproducible in one
step.

## Your data

One SQLite file in the OS application-data directory; the exact path is shown in Settings. The whole
project also exports to readable JSON, which is the format to use for backups, moving to another
machine, or committing alongside the project it describes.

## Licence

[MIT](LICENSE).
