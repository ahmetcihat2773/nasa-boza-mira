# TODO

Tasks for the Space Mission Design Game. Each task names who owns it (an agent from `.claude/agents/`, or the user), what it needs, what it produces, and how we know it is done.

Status: `[ ]` open · `[~]` in progress · `[x]` done

- Open tasks are split into numbered **subtasks** (T4.1, T4.2, …). Do them in order unless a subtask says otherwise, and tick each one when it is finished. Each subtask is small enough to review on its own.
- A task is done when all its subtasks are ticked, its "Done when" list holds and `reviewer` has checked the result. The user makes the commits.
- T1 and T2 were done before the monorepo exists, so they use `data/` at the repo root. T5 moves it to `packages/data`.
- After every edit of `data/launchers.curation.json`, rebuild with `node --experimental-strip-types scripts/fetch-launchers.ts --offline`. It does not call the API, so the Launch Library 2 values stay as they were fetched.
- This list covers the launcher data, the platform and data parts of M0, and the first M1 data files. The other M0 work in [tech.md](tech.md) section 7 (`sim` API, app shell, style guide) and the M1 mission card have no tasks yet.

---

## Launcher data

### [x] T1 – Verify the rideshare price

- **Owner:** `data-curator`
- **Why:** The rideshare entry in `data/launchers.curation.json` used an estimated price. Launch Library 2 has no rideshare prices, and every value in the game needs a source.
- **Input:** [APIDoc.md](APIDoc.md) ("The curated list"), `data/launchers.curation.json`.
- **Do:**
  - Find a published rideshare price from a launch provider (base price, included mass, price per extra kg).
  - Update the `rideshare` entry in the curation file with the values and a `sources` entry (source, URL, date checked, `data_quality`).
  - Write the fixed orbit into the entry (type and altitude) and mark the game-design values in `sources`.
  - Rebuild `data/launchers.json` with `--offline` (do not edit it by hand).
  - Update APIDoc.md (rideshare text, curated list, open item) and add the source to CREDITS.md.
  - Coordinator: update the "Open" notes in [tech.md](tech.md) sections 3 and 7.
- **Done when:**
  - The price fields come from a cited, published source with the date checked.
  - `data/launchers.json` matches the curation file, and its Launch Library 2 values are unchanged.
  - The 200 kg limit, the 98% success rate and the 525 km sun-synchronous orbit are in the data and marked as game-design values.
- **Result (14 November 2026):** SpaceX's rideshare price for 2026 flights: $350,000 for up to 50 kg, then $7,000 for each extra kg. The old value ($325,000 and $6,500) was the 2025 price. The price was first read from search-engine copies of SpaceX's price tool, then confirmed in the tool itself in T3.1.

### [x] T2 – Source the capacity to sun-synchronous orbit

- **Owner:** `data-curator`
- **Why:** Launch Library 2 only lists capacity to low Earth orbit. Wildfire Watch missions will often use a sun-synchronous orbit, where a launcher carries less ([design.md](design.md) section 4.3).
- **Input:** `data/launchers.curation.json`, [design.md](design.md) section 4.3, [APIDoc.md](APIDoc.md).
- **Do:**
  - Find the published capacity to sun-synchronous orbit of Electron, Firefly Alpha and PSLV: the dedicated rockets the Wildfire Watch budget allows. Other rockets are optional.
  - Store each figure as `ssoCapacityKg` in that rocket's `override` in the curation file, with a `sources` entry.
  - Derive one general factor (sun-synchronous capacity ÷ low-Earth-orbit capacity) from those rockets and store it in the curation file with its method. The script applies it to every picked rocket without a published figure and marks the result as an estimate.
  - Give the rideshare entry its own `ssoCapacityKg`: the script does not apply the factor to hand-written entries.
  - Rebuild with `--offline`, describe the method in APIDoc.md and add the sources to CREDITS.md.
  - Coordinator: update [design.md](design.md) section 4.3 and [tech.md](tech.md) sections 3 and 7.
- **Done when:**
  - Every launcher in `data/launchers.json` has an `ssoCapacityKg` and a `sources` entry that says whether it is published, estimated or a game-design value.
  - Each published figure has a source URL and the date checked.
  - APIDoc.md explains the method, lists which rockets use the general factor, and its open item is ticked.
- **Result (14 November 2026):** Published figures for Electron (200 kg), Firefly Alpha (630 kg) and PSLV (1,750 kg). The other seven rockets use the general factor 0.6 and are marked as estimates. The Electron figure was first read from search-engine copies of Rocket Lab's guide, then confirmed in the guide itself in T3.2.

### [x] T3 – Confirm two provider figures in a browser

- **Owner:** the user. It needs an ordinary browser: our tools cannot read these two pages.
- **Why:** T1 and T2 read two figures from search-engine copies of the provider's page, not from the page itself. The data says so in the `note` of each figure.
- **Input:** [APIDoc.md](APIDoc.md) ("Values from launch providers").
- **Subtasks:**
  - [x] **T3.1 – Check the rideshare price.** Open [SpaceX's rideshare price tool](https://rideshare.spacex.com/search) and ask for 50 kg and 60 kg to sun-synchronous orbit. Expected: $350,000 and $420,000. *Result (14 November 2026): confirmed by the user, $0.35M and $0.42M. The rideshare note is updated and the data rebuilt with `--offline`.*
  - [x] **T3.2 – Check the Electron capacity.** Open [Rocket Lab's Electron Payload User's Guide](https://rocketlabcorp.com/assets/Electron-Payload-User-Guide-7.0-v6.pdf). Expected: 200 kg to a 500 km sun-synchronous orbit. *Result (14 November 2026): confirmed by the user, 200 kg.*
  - [x] **T3.3 – Correct any figure that differs** in `data/launchers.curation.json` (or tell the coordinator the real values). *Nothing to correct: both figures matched.*
  - [x] **T3.4 – Clear the notes.** Remove the "still to be confirmed in a browser" sentence from both `note` fields and set `checked` to the day's date. *Both notes now say the figure was confirmed in a browser on 2026-11-14; `checked` was already that date.*
  - [x] **T3.5 – Rebuild** with `--offline` and tick the open item in APIDoc.md. *Rebuilt; only the two note lines changed in `data/launchers.json`.*
- **Done when:**
  - Both figures are confirmed or corrected.
  - The two notes no longer say "still to be confirmed", and the open item in APIDoc.md is ticked.

---

## Foundation (M0)

### [ ] T4 – Create the monorepo foundation

- **Owner:** `platform-engineer`
- **Why:** No game code can be written until the monorepo exists. This is the platform part of milestone M0 in [tech.md](tech.md) section 7.
- **Input:** [tech.md](tech.md) sections 2, 5 and 7.
- **Subtasks:**
  - [ ] **T4.1 – Workspace root.** Root `package.json`, `pnpm-workspace.yaml` (`apps/*`, `packages/*`) and the required Node version (22.6 or newer, as the data script needs). *Output:* `pnpm install` runs cleanly.
  - [ ] **T4.2 – Turborepo.** `turbo.json` with the tasks `dev`, `build`, `test`, `typecheck` and `lint`, and matching root scripts. *Output:* `pnpm test` and `pnpm typecheck` run across all packages (with nothing to do yet).
  - [ ] **T4.3 – Shared TypeScript config.** One strict base `tsconfig` that every package extends.
  - [ ] **T4.4 – Linting and formatting.** ESLint and Prettier at the root, with `pnpm lint` and `pnpm format`. The existing files (`scripts/`, `data/`, the Markdown docs) must pass or be explicitly excluded.
  - [ ] **T4.5 – Line endings.** A `.gitattributes` that keeps `*.json` and `*.ts` files on LF, so generated data files do not change between Windows and other machines. *Check:* an `--offline` rebuild of the launcher data still shows no `git diff`.
  - [ ] **T4.6 – Empty package shells.** `packages/sim` and `packages/data`, each with `package.json`, `tsconfig`, Vitest and one placeholder test. Their owners fill them later (T5, and the `sim` tasks to come). Do not create `apps/web`: `web-developer` owns it.
  - [ ] **T4.7 – API skeleton.** `apps/api` with Hono on Node, a `GET /health` route and its test.
  - [ ] **T4.8 – SQLite.** Drizzle with `better-sqlite3` in `apps/api`: where the database file lives (already ignored by `.gitignore`), a first placeholder table with its migration, and a test that runs against an in-memory database. *Check:* `better-sqlite3` installs on Windows without extra build tools; if it does not, report it before going further.
  - [ ] **T4.9 – One command to run.** `pnpm dev` starts the API through Turborepo (and will start the web app once it exists).
  - [ ] **T4.10 – CI.** A GitHub Actions workflow that runs install, typecheck, lint and tests on every push.
  - [ ] **T4.11 – Report.** List every new dependency with its licence (for `data-curator` to add to CREDITS.md), and say whether the "Getting started" steps in README.md are still correct.
- **Done when:**
  - `pnpm install` and `pnpm dev` work from a clean clone and start the API (and the web app, once `web-developer` adds the app shell).
  - CI passes on push.
  - No Docker and no Python are needed.

### [ ] T5 – Move the data into `packages/data`

- **Owner:** `data-curator`
- **Needs:** T4.
- **Why:** [tech.md](tech.md) section 5 puts all game data in `packages/data`, validated with Zod. The data files are still in `data/` at the repo root.
- **Input:** `data/`, `scripts/fetch-launchers.ts`, [APIDoc.md](APIDoc.md) ("Fields we add").
- **Subtasks:**
  - [ ] **T5.1 – Move the files.** Use `git mv` to move everything in `data/` into `packages/data` (JSON files in one folder, e.g. `packages/data/json/`): the three launcher files and any T6 or T7 files written there. `scripts/` stays at the repo root.
  - [ ] **T5.2 – Fix the script paths.** Update the paths in `scripts/fetch-launchers.ts`. *Check:* an `--offline` rebuild leaves `launchers.json` unchanged (`git diff` shows nothing).
  - [ ] **T5.3 – Shared source schema.** A Zod schema for one `sources` entry (`fields`, `data_quality`, `source`, optional `url`, `checked`, `note`), written once so the parts and instruments files can reuse it.
  - [ ] **T5.4 – Launcher schema.** A Zod schema for a launcher, including `ssoCapacityKg`, `sources` and the rideshare-only fields (`costPerKgUsd`, `includedKg`, `fixedOrbit`, `note`).
  - [ ] **T5.5 – Typed export.** `packages/data` exports the validated launcher list and its TypeScript type, so `sim` and the web app never read the JSON file directly.
  - [ ] **T5.6 – Schema test.** A test that validates `launchers.json` against the schema; the CI from T4 runs it.
  - [ ] **T5.7 – Update the docs.** Fix the paths in APIDoc.md and tick its "move the `data/` files" item. Search the repo for the old `data/` path and report every other place that still names it (TODO.md, README.md, tech.md, the agent files) for the coordinator to fix.
- **Done when:**
  - An `--offline` rebuild at the new path leaves `launchers.json` unchanged (`git diff` shows nothing).
  - The schema test passes in CI.
  - The "move the `data/` files" open item in APIDoc.md is ticked.

---

## Data (M1)

Write these files in `packages/data` if T5 is done, otherwise in `data/` at the repo root.

### [ ] T6 – Build the parts catalogue (`parts.json`)

- **Owner:** `data-curator`
- **Why:** The builder, the budgets and the TRL rules all need parts. Nobody has read the NASA report yet ([APIDoc.md](APIDoc.md)).
- **Input:** [NASA Small Spacecraft report 2024](https://www.nasa.gov/smallsat-institute/sst-soa), NASA CubeSat 101, [tech.md](tech.md) section 3, [design.md](design.md) sections 1, 2 and 4.3.
- **Subtasks:**
  - [ ] **T6.1 – Read the report.** Read the subsystem chapters of the NASA Small Spacecraft report and CubeSat 101. Note in APIDoc.md which chapters and tables are usable, and how the report states TRL.
  - [ ] **T6.2 – Propose the part record.** Before typing any data, write down the fields of one part: id, name, subsystem, owning role (design.md section 2), tier, mass, power (used or produced), cost, main performance value and its unit, TRL, which spacecraft sizes it fits (6U / 12U / small satellite), `sources`. Also write down the tier rule and the cost method (e.g., the SSCM19 paper or published list prices). **Stop and report this to the coordinator for approval before T6.3.**
  - [ ] **T6.3 – Structure.** Frames and buses for 6U, 12U and the ~150 kg small satellite.
  - [ ] **T6.4 – Power generation.** Solar panels (body-mounted and deployable).
  - [ ] **T6.5 – Batteries.**
  - [ ] **T6.6 – Onboard computers.**
  - [ ] **T6.7 – Attitude control.** Reaction wheels, magnetorquers, star trackers or integrated units.
  - [ ] **T6.8 – Propulsion.** Including "none", because a CubeSat can fly without it (this matters for the space-debris event and for orbit decay).
  - [ ] **T6.9 – Communications.** Radios and antennas with their data rates. These belong to the Ground role.
  - [ ] **T6.10 – Coverage check.** At least one part per tier in every subsystem; parts in every TRL band of design.md section 1, including a few at TRL ≤ 4; every subsystem offers something for each spacecraft size. List the gaps and fill them.
  - [ ] **T6.11 – Sources.** Every part has a `sources` entry with a `data_quality` flag, and the file says how each cost was derived.
  - [ ] **T6.12 – Schema and test.** A Zod schema for a part (reusing the source schema from T5.3) and a test that validates the file. *Needs T5;* if T5 is not done yet, leave this subtask open and finish the rest.
  - [ ] **T6.13 – Update the docs.** Add the sources to CREDITS.md, describe the method in APIDoc.md and tick its "extract parts" item.

  T6.3 to T6.9 can be done in any order, and each can be reviewed on its own.
- **Done when:**
  - There are 30–50 parts, with at least one per tier in every subsystem.
  - Parts exist in every TRL band of design.md section 1, including a few at TRL ≤ 4 that the first mission shows as locked.
  - Every part has a source, and CREDITS.md and APIDoc.md are updated.

### [ ] T7 – Curate the instruments (`instruments.json`)

- **Owner:** `data-curator`
- **Why:** Requirement R2, the night-detection bonus and the revisit-versus-sharpness trade-off all depend on the instrument ([design.md](design.md) section 4.3).
- **Input:** [NASA mission archive (NSSDCA)](https://nssdc.gsfc.nasa.gov/nmc/) and NASA mission pages, [tech.md](tech.md) section 3, [design.md](design.md) sections 1 and 4.3.
- **Scope:** only what the first mission, Wildfire Watch, needs: **6–8 instruments**. More are added when later missions need them.
- **Open question for the user:** flown instruments are all TRL 9, so the "new technology is better but takes longer" trade-off (design.md section 1) would not apply to instruments. Recommended: 2–3 of the 6–8 are not-yet-flown or recently demonstrated instruments. T7.2 proposes candidates and stops for the user's decision.
- **Subtasks:**
  - [ ] **T7.1 – Find candidates.** From NASA mission pages and the NASA mission archive, list real instruments of these kinds, with the mission each flew on:
    - visible-light cameras, one narrow and one wide field of view;
    - short-wave or mid-wave infrared imagers that detect active fires in daylight (R2), one CubeSat-sized and one larger;
    - thermal infrared imagers for night detection (the bonus objective), one CubeSat-sized and one larger;
    - one large multi-band instrument that only fits the ~150 kg satellite.
  - [ ] **T7.2 – Propose the record and the list.** Write down the fields of one instrument: id, name, kind, mass, power, data rate, cost, TRL, field of view, ground sharpness at a reference altitude, what it can detect (daylight fire, night fire), which spacecraft sizes it fits, `sources`. Give the proposed 6–8 instruments, and 2–3 lower-TRL candidates with their source (for example NASA Earth Science Technology Office projects, if their data is usable). **Stop and report to the coordinator for the user's approval before T7.3.**
  - [ ] **T7.3 – Record the instruments.** Fill in every field for the approved list.
  - [ ] **T7.4 – Game-design values.** Add the science value of each instrument for Wildfire Watch and mark it as a game-design number.
  - [ ] **T7.5 – Sources.** Every instrument has a `sources` entry with a `data_quality` flag, and the file says how each cost was derived.
  - [ ] **T7.6 – Playability check.** With the parts from T6 and the launchers, confirm on paper that at least two different designs can meet R1–R4 within the $30M budget: one CubeSat design and one small-satellite design. Report any instrument that no design can afford or power.
  - [ ] **T7.7 – Schema and test.** A Zod schema for an instrument (reusing the source schema from T5.3) and a test that validates the file. *Needs T5.*
  - [ ] **T7.8 – Update the docs.** Add the sources to CREDITS.md, describe the method in APIDoc.md and tick its "curate instruments" item.
- **Done when:**
  - There are 6–8 instruments.
  - Wildfire Watch has real choices: daylight fire detection (R2), thermal infrared for night detection, and both narrow and wide fields of view.
  - Some instruments fit a 6U or 12U CubeSat and at least one needs the ~150 kg satellite, so both spacecraft sizes on the mission card can be played.
  - Every instrument has a source, and CREDITS.md and APIDoc.md are updated.
