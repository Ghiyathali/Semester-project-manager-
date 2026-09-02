# Contributing

Thanks for considering it. This is a student tool, and the people best placed to improve it are
students who have run a semester project and found the plan wrong in some specific way.

## Getting set up

```bash
npm install
npm run dev
```

Node 20 or newer. Nothing needs compiling — SQLite runs as WebAssembly, so there is no native
module and no build toolchain to install.

For UI work, `npm run dev:web` serves the renderer alone at <http://localhost:5180> against an
in-memory demo project. It is much faster to iterate against than the full Electron shell.

## Before opening a pull request

```bash
npm run typecheck
npm run lint
npm test
```

CI runs all three, plus a build on Windows, macOS and Linux.

## Where to put things

- **Scheduling logic goes in `src/core`.** That directory must not import Electron, Node built-ins
  or React. Keeping it pure is what makes the planner testable, and it lets the renderer reuse it
  without a round trip through IPC. Anything you add there deserves a test in
  `src/core/scheduler/scheduler.test.ts`.
- **Database access goes in `src/main/db/repositories`.** SQL does not belong anywhere else.
- **New IPC surface goes in `src/shared/ipc.ts` first**, then a handler in
  `src/main/ipc/handlers.ts` with a zod schema for the payload. The renderer is untrusted; every
  payload is validated at the boundary.

## Conventions

- **Wall-clock time.** Dates are `YYYY-MM-DD`, times are `HH:MM`, and the scheduler never converts
  to UTC. Please do not introduce a timezone library into `src/core`.
- **Generated versus edited rows.** Plan rows carry `is_generated` and `is_user_modified`. If you
  add a table that a re-plan rewrites, it needs the same treatment, plus handling in
  `clearGeneratedPlan` and `relinkPreserved`.
- **Prettier settings live in `.prettierrc`** — no semicolons, single quotes, 100 columns.
  `npm run format` applies them.
- Comments should explain *why*, not restate the code. There are a few decisions in this codebase
  that look odd without their reason (WebAssembly SQLite, hand-drawn SVG roadmap, floating times in
  the `.ics` export); those reasons are written down at the top of the relevant file, and it is
  worth reading them before changing that file.

## Good first contributions

- More UP deliverable templates, or variants matching a particular university's requirements.
- Additional availability presets in the setup wizard.
- Better empty states and first-run guidance.
- Accessibility fixes — keyboard navigation in the availability grid is the weakest part today.

## Reporting a scheduling bug

Attach a JSON export (Settings → Export this project). It contains the dates, availability and plan,
which makes almost any scheduling bug reproducible in one step.
