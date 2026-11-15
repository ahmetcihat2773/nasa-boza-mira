# TODO

Tasks for the Space Mission Design Game. Each task names who owns it (an agent from `.claude/agents/`, or the user), what it needs, what it produces, and how we know it is done.

Status: `[ ]` open · `[~]` in progress · `[x]` done

- Open tasks are split into numbered **subtasks** (T4.1, T4.2, …). Do them in order unless a subtask says otherwise, and tick each one when it is finished. Each subtask is small enough to review on its own.
- A task is done when all its subtasks are ticked and its "Done when" list holds. There is no review step: the user tries the result and reports bugs, which then become fixes. `reviewer` runs only when the user asks. The user makes the commits.
- T1–T3 were done before the monorepo existed, so their text names `data/` at the repo root. T5 moved the data to `packages/data/json/`.
- After every edit of `packages/data/json/launchers.curation.json`, rebuild with `node --experimental-strip-types scripts/fetch-launchers.ts --offline`. It does not call the API, so the Launch Library 2 values stay as they were fetched.
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

### [x] T4 – Create the monorepo foundation

- **Owner:** `platform-engineer`
- **Why:** No game code can be written until the monorepo exists. This is the platform part of milestone M0 in [tech.md](tech.md) section 7.
- **Input:** [tech.md](tech.md) sections 2, 5 and 7.
- **Subtasks:**
  - [x] **T4.1 – Workspace root.** Root `package.json`, `pnpm-workspace.yaml` (`apps/*`, `packages/*`) and the required Node version (22.6 or newer, as the data script needs). *Output:* `pnpm install` runs cleanly.
  - [x] **T4.2 – Turborepo.** `turbo.json` with the tasks `dev`, `build`, `test`, `typecheck` and `lint`, and matching root scripts. *Output:* `pnpm test` and `pnpm typecheck` run across all packages (with nothing to do yet).
  - [x] **T4.3 – Shared TypeScript config.** One strict base `tsconfig` that every package extends.
  - [x] **T4.4 – Linting and formatting.** ESLint and Prettier at the root, with `pnpm lint` and `pnpm format`. The existing files (`scripts/`, `data/`, the Markdown docs) must pass or be explicitly excluded.
  - [x] **T4.5 – Line endings.** A `.gitattributes` that keeps `*.json` and `*.ts` files on LF, so generated data files do not change between Windows and other machines. *Check:* an `--offline` rebuild of the launcher data still shows no `git diff`.
  - [x] **T4.6 – Empty package shells.** `packages/sim` and `packages/data`, each with `package.json`, `tsconfig`, Vitest and one placeholder test. Their owners fill them later (T5, and the `sim` tasks to come). Do not create `apps/web`: `web-developer` owns it.
  - [x] **T4.7 – API skeleton.** `apps/api` with Hono on Node, a `GET /health` route and its test.
  - [x] **T4.8 – SQLite.** Drizzle with `better-sqlite3` in `apps/api`: where the database file lives (already ignored by `.gitignore`), a first placeholder table with its migration, and a test that runs against an in-memory database. *Check:* `better-sqlite3` installs on Windows without extra build tools; if it does not, report it before going further.
  - [x] **T4.9 – One command to run.** `pnpm dev` starts the API through Turborepo (and will start the web app once it exists).
  - [x] **T4.10 – CI.** A GitHub Actions workflow that runs install, typecheck, lint and tests on every push.
  - [x] **T4.11 – Report.** List every new dependency with its licence (for `data-curator` to add to CREDITS.md), and say whether the "Getting started" steps in README.md are still correct.
- **Done when:**
  - `pnpm install` and `pnpm dev` work from a clean clone and start the API (and the web app, once `web-developer` adds the app shell).
  - CI passes on push.
  - No Docker and no Python are needed.

### [x] T5 – Move the data into `packages/data`

- **Owner:** `data-curator`
- **Needs:** T4.
- **Why:** [tech.md](tech.md) section 5 puts all game data in `packages/data`, validated with Zod. The data files are still in `data/` at the repo root.
- **Input:** `data/`, `scripts/fetch-launchers.ts`, [APIDoc.md](APIDoc.md) ("Fields we add").
- **Subtasks:**
  - [x] **T5.1 – Move the files.** Use `git mv` to move everything in `data/` into `packages/data` (JSON files in one folder, e.g. `packages/data/json/`): the three launcher files and any T6 or T7 files written there. `scripts/` stays at the repo root.
  - [x] **T5.2 – Fix the script paths.** Update the paths in `scripts/fetch-launchers.ts`. *Check:* an `--offline` rebuild leaves `launchers.json` unchanged (`git diff` shows nothing).
  - [x] **T5.3 – Shared source schema.** A Zod schema for one `sources` entry (`fields`, `data_quality`, `source`, optional `url`, `checked`, `note`), written once so the parts and instruments files can reuse it.
  - [x] **T5.4 – Launcher schema.** A Zod schema for a launcher, including `ssoCapacityKg`, `sources` and the rideshare-only fields (`costPerKgUsd`, `includedKg`, `fixedOrbit`, `note`).
  - [x] **T5.5 – Typed export.** `packages/data` exports the validated launcher list and its TypeScript type, so `sim` and the web app never read the JSON file directly.
  - [x] **T5.6 – Schema test.** A test that validates `launchers.json` against the schema; the CI from T4 runs it.
  - [x] **T5.7 – Update the docs.** Fix the paths in APIDoc.md and tick its "move the `data/` files" item. Search the repo for the old `data/` path and report every other place that still names it (TODO.md, README.md, tech.md, the agent files) for the coordinator to fix.
- **Done when:**
  - An `--offline` rebuild at the new path leaves `launchers.json` unchanged (`git diff` shows nothing).
  - The schema test passes in CI.
  - The "move the `data/` files" open item in APIDoc.md is ticked.

---

## Data (M1)

Write these files in `packages/data/json/`, with their Zod schema in `packages/data/src/`.

### [x] T6 – Build the parts catalogue (`parts.json`)

- **Owner:** `data-curator`
- **Why:** The builder, the budgets and the TRL rules all need parts. Nobody has read the NASA report yet ([APIDoc.md](APIDoc.md)).
- **Input:** [NASA Small Spacecraft report 2024](https://www.nasa.gov/smallsat-institute/sst-soa), NASA CubeSat 101, [tech.md](tech.md) section 3, [design.md](design.md) sections 1, 2 and 4.3.
- **Subtasks:**
  - [x] **T6.1 – Read the report.** Read the subsystem chapters of the NASA Small Spacecraft report and CubeSat 101. Note in APIDoc.md which chapters and tables are usable, and how the report states TRL.
  - [x] **T6.2 – Propose the part record.** Before typing any data, write down the fields of one part: id, name, subsystem, owning role (design.md section 2), tier, mass, power (used or produced), cost, main performance value and its unit, TRL, which spacecraft sizes it fits (6U / 12U / small satellite), `sources`. Also write down the tier rule and the cost method (e.g., the SSCM19 paper or published list prices). **Stop and report this to the coordinator for approval before T6.3.**
  - [x] **T6.3 – Structure.** Frames and buses for 6U, 12U and the ~150 kg small satellite.
  - [x] **T6.4 – Power generation.** Solar panels (body-mounted and deployable).
  - [x] **T6.5 – Batteries.**
  - [x] **T6.6 – Onboard computers.**
  - [x] **T6.7 – Attitude control.** Reaction wheels, magnetorquers, star trackers or integrated units.
  - [x] **T6.8 – Propulsion.** Including "none", because a CubeSat can fly without it (this matters for the space-debris event and for orbit decay).
  - [x] **T6.9 – Communications.** Radios and antennas with their data rates. These belong to the Ground role.
  - [x] **T6.10 – Coverage check.** At least one part per tier in every subsystem; parts in every TRL band of design.md section 1, including a few at TRL ≤ 4; every subsystem offers something for each spacecraft size. List the gaps and fill them.
  - [x] **T6.11 – Sources.** Every part has a `sources` entry with a `data_quality` flag, and the file says how each cost was derived.
  - [x] **T6.12 – Schema and test.** A Zod schema for a part (reusing the source schema from T5.3) and a test that validates the file. *Needs T5;* if T5 is not done yet, leave this subtask open and finish the rest.
  - [x] **T6.13 – Update the docs.** Add the sources to CREDITS.md, describe the method in APIDoc.md and tick its "extract parts" item.

  T6.3 to T6.9 can be done in any order, and each can be reviewed on its own.
- **Done when:**
  - There are 30–50 parts, with at least one per tier in every subsystem.
  - Parts exist in every TRL band of design.md section 1, including a few at TRL ≤ 4 that the first mission shows as locked.
  - Every part has a source, and CREDITS.md and APIDoc.md are updated.

### [x] T7 – Curate the instruments (`instruments.json`)

- **Owner:** `data-curator`
- **Why:** Requirement R2, the night-detection bonus and the revisit-versus-sharpness trade-off all depend on the instrument ([design.md](design.md) section 4.3).
- **Input:** [NASA mission archive (NSSDCA)](https://nssdc.gsfc.nasa.gov/nmc/) and NASA mission pages, [tech.md](tech.md) section 3, [design.md](design.md) sections 1 and 4.3.
- **Scope:** only what the first mission, Wildfire Watch, needs: **6–8 instruments**. More are added when later missions need them.
- **Decided by the user (14 November 2026):** 2–3 of the 6–8 instruments are not-yet-flown or recently demonstrated instruments, so the "new technology is better but takes longer" trade-off (design.md section 1) also applies to instruments. The user accepts the recommendations for all of T7: there are no approval stops, the agent decides and records each decision with its reason.
- **Subtasks:**
  - [x] **T7.1 – Find candidates.** From NASA mission pages and the NASA mission archive, list real instruments of these kinds, with the mission each flew on:
    - visible-light cameras, one narrow and one wide field of view;
    - short-wave or mid-wave infrared imagers that detect active fires in daylight (R2), one CubeSat-sized and one larger;
    - thermal infrared imagers for night detection (the bonus objective), one CubeSat-sized and one larger;
    - one large multi-band instrument that only fits the ~150 kg satellite.
  - [x] **T7.2 – Propose the record and the list.** Write down the fields of one instrument: id, name, kind, mass, power, data rate, cost, TRL, field of view, ground sharpness at a reference altitude, what it can detect (daylight fire, night fire), which spacecraft sizes it fits, `sources`. Give the proposed 6–8 instruments, and 2–3 lower-TRL candidates with their source (for example NASA Earth Science Technology Office projects, if their data is usable). Record the choice and its reasons in APIDoc.md, then continue (no approval stop).
  - [x] **T7.3 – Record the instruments.** Fill in every field for the approved list.
  - [x] **T7.4 – Game-design values.** Add the science value of each instrument for Wildfire Watch and mark it as a game-design number.
  - [x] **T7.5 – Sources.** Every instrument has a `sources` entry with a `data_quality` flag, and the file says how each cost was derived.
  - [x] **T7.6 – Playability check.** With the parts from T6 and the launchers, confirm on paper that at least two different designs can meet R1–R4 within the $30M budget: one CubeSat design and one small-satellite design. Report any instrument that no design can afford or power.
  - [x] **T7.7 – Schema and test.** A Zod schema for an instrument (reusing the source schema from T5.3) and a test that validates the file. *Needs T5.*
  - [x] **T7.8 – Update the docs.** Add the sources to CREDITS.md, describe the method in APIDoc.md and tick its "curate instruments" item.
- **Done when:**
  - There are 6–8 instruments.
  - Wildfire Watch has real choices: daylight fire detection (R2), thermal infrared for night detection, and both narrow and wide fields of view.
  - Some instruments fit a 6U or 12U CubeSat and at least one needs the ~150 kg satellite, so both spacecraft sizes on the mission card can be played.
  - Every instrument has a source, and CREDITS.md and APIDoc.md are updated.

---

## Visuals (M1–M2)

The first web screen (built quickly, outside this list) has a placeholder 2D CSS launch animation. These tasks replace it with the 3D plan in [tech.md](tech.md) (sections 2 and 3, React Three Fiber + NASA 3D Resources). Visual quality matters: this is what the demo video shows.

### [x] T8 – 3D orbit view

- **Owner:** `visuals-developer`
- **Why:** The orbit is the Launch role's main decision, and the 3D view is what makes the demo memorable.
- **Subtasks:**
  - [x] **T8.1 – Scene setup.** React Three Fiber + drei in `apps/web/src/scene/`, a `<Canvas>` panel on the design screen, orbit controls (drag to rotate, scroll to zoom), a starfield.
  - [x] **T8.2 – Earth.** A textured Earth (NASA Blue Marble or a NASA 3D Resources Earth texture, public domain; optimised, committed in `apps/web/public/`), slow rotation, soft atmosphere glow, day/night lighting from a sun direction.
  - [x] **T8.3 – Orbit and satellite.** The orbit drawn as a line at the design's altitude and inclination (sun-synchronous ≈ 97.5°; altitude from the rideshare's fixed orbit, otherwise a default of 525 km until an altitude choice exists), with a small satellite model moving along it at a visibly accelerated rate. Positions come from a small pure function in `packages/sim` (circular orbit: period from altitude), with a test.
  - [x] **T8.4 – Ground station and swath.** One or two ground stations on the globe; the satellite's link line shows when it is in contact. The instrument's swath shown as a light strip on the ground under the satellite (width from field of view and altitude, a placeholder width if no instrument is chosen).
  - [x] **T8.5 – Polish and performance.** Readable at the dashboard size, smooth on a normal laptop, `prefers-reduced-motion` respected, no console errors. Credit the texture in CREDITS.md.

### [x] T9 – 3D launch sequence

- **Owner:** `visuals-developer`
- **Needs:** T8.
- **Why:** The current CSS rocket does not look like the game we want.
- **Subtasks:**
  - [x] **T9.1 – Launch scene.** Full-screen 3D scene on Launch: a launch pad, a rocket model (simple modelled geometry or a NASA 3D Resources model), countdown, engine flame and smoke particles, camera following the ascent.
  - [x] **T9.2 – Outcome.** PASS: the rocket climbs, the camera pulls back to the curved Earth and the satellite separates into its orbit (hand-off to the T8 orbit view). FAIL: the launch is scrubbed on the pad with a clear message.
  - [x] **T9.3 – Replace the placeholder.** Remove the CSS `LaunchSequence` and its styles from `apps/web/src/App.tsx` and `styles.css`; keep "click to skip".

### [x] T10 – Spacecraft view

- **Owner:** `visuals-developer`
- **Subtasks:**
  - [x] **T10.1 – Bus by size.** A 6U, 12U or small-satellite body that changes with the chosen structure.
  - [x] **T10.2 – Parts on the model.** Solar panels (body-mounted or deployable wings), antenna and instrument aperture appear as the parts are chosen.

---

## Simulation (M1–M2)

### [x] T11 – Align the budget rules with design.md

- **Owner:** `sim-engineer`
- **Why:** The first web screen was built quickly with two shortcuts that differ from [design.md](design.md) section 1 and the mission card.
- **Subtasks:**
  - [x] **T11.1 – TRL penalties add up.** Development time = base time + the **sum** of all chosen parts' and instruments' penalties (today only the worst penalty counts).
  - [x] **T11.2 – Team cost by allocation.** The monthly team cost is charged to the roles in proportion to their budget allocations (today it all goes to Spacecraft). Update the dashboard label in `apps/web`. *(Done: dashboard uses `spendByRole`.)*
  - [x] **T11.3 – Move the mission card into data.** Replace the hard-coded `WILDFIRE_WATCH` in `packages/sim` with the mission card from `packages/data` (T15).
  - [x] **T11.4 – Tests** for both rules.

### [x] T12 – Earth-orbit model

- **Owner:** `sim-engineer`
- **Subtasks:**
  - [x] **T12.1 – Basics.** Period, ground speed, eclipse fraction and sun-synchronous inclination from altitude (circular orbits).
  - [x] **T12.2 – Lifetime (R4).** Simple orbit decay by altitude (a table of plausible lifetimes), and the effect of propulsion "none".
  - [x] **T12.3 – Revisit (R1).** Revisit of the target region from swath width (instrument field of view and altitude) and orbit.
  - [x] **T12.4 – Ground contact and data (R3).** Contact minutes per day by number of ground stations, data downlinked per day from the radio's data rate, data produced by the instrument.
  - [x] **T12.5 – Power over an orbit.** Average power produced including eclipse; battery sized for the eclipse.
  - [x] **T12.6 – Tests** with known values (e.g., about 95 minutes period at 525 km).

### [x] T13 – Full design validation (R1–R4 and launcher)

- **Owner:** `sim-engineer`
- **Needs:** T12.
- **Subtasks:**
  - [x] **T13.1 – Instruments in the budget:** mass, power, data, cost (Science allocation), TRL.
  - [x] **T13.2 – Requirements R1–R4** checked with the orbit model, each with a plain-English reason when it fails.
  - [x] **T13.3 – Launcher compatibility:** capacity to the chosen orbit, the rideshare's fixed orbit, rideshare price by mass.
  - [x] **T13.4 – Deadline penalty:** missing the 30-month deadline means a 12-month wait at team cost and a zero schedule score, not a failure (design.md section 1).

### [x] T14 – Mission run: events, scoring and the report

- **Owner:** `sim-engineer`
- **Needs:** T13, T16.
- **Subtasks:**
  - [x] **T14.1 – Seeded run.** A deterministic `runMission(design, mission, seed)` that steps through development, launch and operations.
  - [x] **T14.2 – Launch failure** rolled from the launcher's success rate.
  - [x] **T14.3 – Events:** 3–5 per run from the event list, each checking a design margin, with team decisions as inputs.
  - [x] **T14.4 – Scoring:** success gate, then science 40 · efficiency 20 · schedule 15 · risk 15 · coordination 10 (design.md section 5), stars 1–3.
  - [x] **T14.5 – Cause chain:** plain-English explanations of every outcome, used by the report and the Flight Director.
  - [x] **T14.6 – Real-mission match:** the nearest real mission from T16.2.

---

## Data and content (M1–M2)

Plausible values are enough (no research): mark them `estimated` or `game-design`.

### [x] T15 – Wildfire Watch mission card

- **Owner:** `data-curator`
- **Subtasks:**
  - [x] **T15.1 – Schema and file** for the mission card: objective, why it matters, requirements R1–R4 with thresholds, constraints, budget, allocations, team cost, base times, deadline, score weights, bonus objectives (design.md section 4.3).
  - [x] **T15.2 – Orbit options and ground stations:** a few altitudes (e.g., 400–700 km), orbit types, 1–3 ground station locations with plausible contact times.

### [x] T16 – Events and real missions

- **Owner:** `data-curator`
- **Subtasks:**
  - [x] **T16.1 – Events file:** the 9 Wildfire Watch events from design.md section 6.2, each with its phase, the margin it checks, the decision options and their effects, and a "why does this happen?" text.
  - [x] **T16.2 – Real missions:** 10–15 Earth-observation satellites (e.g., Landsat, Terra, Aqua, Suomi NPP, a fire-detection CubeSat) with orbit, mass, power and instrument type, for the "your design resembles…" match.

### [x] T17 – Learning texts

- **Owner:** `data-curator`
- **Subtasks:**
  - [x] **T17.1 – Glossary and tooltips:** one plain-language sentence for every term the UI shows (TRL, SSO, swath, downlink, …), with "learn more" links.
  - [x] **T17.2 – First-play tour:** 5–6 short steps (design.md section 9).
  - [x] **T17.3 – Role advisor lines** for solo play (design.md section 3.4).

---

## Web app (M1–M3)

### [x] T18 – Complete the design screen

- **Owner:** `web-developer`
- **Needs:** T13.
- **Subtasks:**
  - [x] **T18.1 – Instrument picker** for the Science role, with the same live effect preview and lock reasons as parts.
  - [x] **T18.2 – Orbit and ground choices:** altitude and orbit type (Launch role), number of ground stations (Ground role); fixed for the rideshare.
  - [x] **T18.3 – Role tabs:** Launch, Spacecraft, Ground and Science, each showing only its own choices and budget allocation.
  - [x] **T18.4 – Requirements panel:** R1–R4 status with plain-English reasons.
  - [x] **T18.5 – Tooltips and glossary** from T17.

### [x] T19 – Game flow, events and results

- **Owner:** `web-developer`
- **Needs:** T14, T18.
- **Subtasks:**
  - [x] **T19.1 – Phases:** Setup, Briefing, Concept, Trade-offs, Design approval, Development, Launch, Operations, Results (design.md section 7).
  - [x] **T19.2 – Event decisions** during development and operations.
  - [x] **T19.3 – Results screen:** score components, stars, the post-mission report with its cause chain, the real-mission match.
  - [x] **T19.4 – Retry and compare:** same seed, new seed, and the last two attempts side by side (design.md section 8).
  - [x] **T19.5 – First-play tour** from T17.2.

### [x] T20 – Team play (hot-seat)

- **Owner:** `web-developer` (rules: `sim-engineer`)
- **Needs:** T19.
- **Subtasks:**
  - [x] **T20.1 – Player setup:** solo or 2–4 players with nicknames; role assignment (fewer players take more roles).
  - [x] **T20.2 – Turns:** the screen shows the role and nickname that is up next; each player acts only for their roles.
  - [x] **T20.3 – Voting in turn** for design approval and Go / No-Go.
  - [x] **T20.4 – Requests and trades** between roles; advisors raise them in solo play (design.md section 3).
  - [x] **T20.5 – Coordination score** inputs passed to the sim.

---

## Local API (M2–M5)

### [x] T21 – Saved attempts and leaderboard

- **Owner:** `platform-engineer`
- **Subtasks:**
  - [x] **T21.1 – Tables:** attempts (design, seed, result, score, nickname, time).
  - [x] **T21.2 – Endpoints:** save an attempt, list recent attempts, leaderboard per mission; CORS or a Vite proxy for the web app.
  - [x] **T21.3 – Web hook-up** of retry/compare and the leaderboard (with `web-developer`).

### [x] T22 – AI Flight Director (`claude -p`)

- **Owner:** `platform-engineer`
- **Needs:** T14.5.
- **Subtasks:**
  - [x] **T22.1 – Endpoint** that runs `claude -p` with no tools and a fixed prompt file, sending the result and cause chain.
  - [x] **T22.2 – Template fallback** when the CLI is missing or fails.
  - [x] **T22.3 – Web:** the debrief appears after the result without blocking it.

---

## Housekeeping

### [ ] T23 – Setup docs and tooling

- **Owner:** coordinator (the user for T23.2 and T23.3)
- **Subtasks:**
  - [x] **T23.1 – README and tech.md:** Node 22.12 or newer; run pnpm as `npx --yes pnpm@10.34.9` (or `pnpm` once corepack works); project structure now has `apps/web`, `apps/api`, `packages/sim`, `packages/data`; API port 8787.
  - [ ] **T23.2 – Decide on corepack:** `npm i -g corepack@latest` (user-level global install) so plain `pnpm` works.
  - [x] **T23.3 – CI:** dropped by the user (no tests or CI needed). The workflow now runs only when started by hand.

---

## Presentation (M6)

### [ ] T24 – Submission material

- **Owner:** coordinator with the user
- **Subtasks:**
  - [ ] **T24.1 – Demo script:** a solo run and a short hot-seat run of Wildfire Watch, including one failure and its explanation.
  - [ ] **T24.2 – Video** recorded locally.
  - [ ] **T24.3 – Slides or project page:** challenge fit (CML phases, mission segments as roles), data sources, the trade-offs the game teaches, the disclaimer.

---

## Later (M4–M5, not broken down yet)

- More missions: Lunar Ice Hunter, Mars Climate Orbiter (Orrery modules, NASA LSP data), Europa, sandbox.
- Difficulty levels; export and import of designs; sound; accessibility pass; real satellites (ISS) in the orbit view.
- Team-vs-team competition (D6).

---

## Second mission: Lunar Ice Hunter

Spec: [design.md](design.md) section 10. Plausible values, no research, no tests unless needed (typecheck only).

**Shared contract (agreed up front so T25–T27 can run in parallel):**
- The new mission card is exported from `@space-mission/data` as `lunarIceHunter` and included in `missionCards`. It keeps every field Wildfire Watch has and adds `destination: "earth-orbit" | "lunar-orbit"` (Wildfire Watch gets `"earth-orbit"`) and, for the Moon, a `transfer` block: `{ tliCapacityFactor, loiDeltaVKmS, stationKeepingKmSPerYear, distanceKm }` (station-keeping may be a small table by altitude).
- Instruments gain `detects: "waterIce"` where relevant. Parts gain an optional `specificImpulseS` (propulsion) and an optional `lunarRateFactor` (radios: data rate multiplier at lunar distance). Ground stations gain `kind: "near-earth" | "deep-space"`.
- The sim exposes `missionFromCard(card)` for both cards; `computeBudget`, `planEvents` and `runMission` work unchanged for Wildfire Watch.

### [x] T25 – Lunar data

- **Owner:** `data-curator`
- **Subtasks:**
  - [x] **T25.1 – Mission card** `lunarIceHunter` per design.md 10.1 (L1–L5 thresholds, `destination`, `transfer`), and `destination: "earth-orbit"` on Wildfire Watch.
  - [x] **T25.2 – Instruments:** 3 ice-detecting instruments (neutron spectrometer, SWIR spectrometer, small radar), sizes 12U and small satellite.
  - [x] **T25.3 – Propulsion and radios:** `specificImpulseS` on every propulsion part; `lunarRateFactor` on every radio; one or two higher-thrust propulsion options sized for lunar orbit insertion if the current ones are too weak.
  - [x] **T25.4 – Deep-space stations** (3, about 120° apart) and a **lunar rideshare** launcher entry (fixed, small mass, cheaper). *Fixed 250 kg to the Moon, first flight month 30.*
  - [x] **T25.5 – Events and texts:** the four lunar events (design.md 10.3) tagged with their mission; glossary terms (TLI, LOI, delta-v, specific impulse, permanently shadowed region); advisor lines for the Moon.

### [x] T26 – Lunar rules in the sim

- **Owner:** `sim-engineer`
- **Subtasks:**
  - [x] **T26.1 – Mission destination:** `missionFromCard` handles both cards; Earth-orbit rules stay as they are.
  - [x] **T26.2 – Transfer and delta-v:** launcher capacity to the Moon (LEO × factor, or the lunar rideshare), insertion and station-keeping delta-v by altitude, propellant mass from the rocket equation, propulsion "none" locked.
  - [x] **T26.3 – Lunar orbit model:** period, eclipse fraction, polar coverage, contact time with deep-space stations, data per day with the radio's lunar factor.
  - [x] **T26.4 – Checks L1–L5** with plain-English reasons; lunar events in `planEvents` / `runMission`; scoring from the card.

### [x] T27 – Earth–Moon visuals

- **Owner:** `visuals-developer`
- **Subtasks:**
  - [x] **T27.1 – Moon** (textured, public-domain NASA image or procedural), Earth in the distance, correct-looking scale (not to true distance).
  - [x] **T27.2 – Transfer:** after separation, the trans-lunar injection burn, a transfer arc to the Moon, the insertion burn and capture into a polar orbit.
  - [x] **T27.3 – Lunar orbit view:** the spacecraft in polar orbit, its ground track over the poles, the link line to Earth.
  - [x] **T27.4 – Hook-up:** `OrbitView` and `LaunchScene` pick the Earth or Moon version from the mission's `destination`.

### [x] T28 – Mission selection in the web app

- **Owner:** `web-developer`
- **Needs:** T25, T26.
- **Subtasks:**
  - [x] **T28.1 – Mission selection screen** before the Briefing (cards for both missions).
  - [x] **T28.2 – Use the chosen mission everywhere:** briefing, pickers (6U and propulsion "none" locked for the Moon, with reasons), requirements panel (L1–L5), delta-v and propellant on the dashboard, events, results, saved attempts and leaderboard per mission.

### [x] T29 – AI Mission Control (two agents, one mission, one expected problem)

- **Owner:** coordinator
- **Why:** A simple, demo-ready story for the presentation: one agent designs the mission, another detects a launch problem and fixes it.
- **Subtasks:**
  - [x] **T29.1 – Sim (`packages/sim/src/autopilot.ts`):** the scenario (release 150 km below the planned orbit), check C1 (thruster delta-v to climb back, Hohmann transfer + 10%), a built-in designer (local search over part swaps), launch telemetry, recovery options and their outcome. Tests in `autopilot.test.ts`.
  - [x] **T29.2 – API:** `POST /agents/designer` and `POST /agents/monitor` (`apps/api/src/agents.ts`, prompts in `apps/api/prompts/`). Claude proposes, the sim validates; up to 3 designer attempts with the failed checks fed back; built-in fallback when Claude is missing or answers badly.
  - [x] **T29.3 – Web:** the AI Mission Control screen (`MissionControl.tsx`): agent panels, attempts, live telemetry and altitude chart, decision table, orbit view and the result with a "without a thruster" comparison. Runs the built-in agents in the browser when the API is down.

