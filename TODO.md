# TODO

Tasks for the Space Mission Design Game. Each task names who owns it (an agent from `.claude/agents/`, or the user), what it needs, what it produces, and how we know it is done.

Status: `[ ]` open · `[~]` in progress · `[x]` done

- A task is done when its "Done when" list holds and `reviewer` has checked the result. The user makes the commits.
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
- **Result (14 November 2026):** SpaceX's rideshare price for 2026 flights: $350,000 for up to 50 kg, then $7,000 for each extra kg. The old value ($325,000 and $6,500) was the 2025 price. The price was read from search-engine copies of SpaceX's price tool, not from the tool itself; T3 confirms it in a browser.

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
- **Result (14 November 2026):** Published figures for Electron (200 kg), Firefly Alpha (630 kg) and PSLV (1,750 kg). The other seven rockets use the general factor 0.6 and are marked as estimates. The Electron figure was read from search-engine copies of Rocket Lab's guide; T3 confirms it in a browser.

### [ ] T3 – Confirm two provider figures in a browser

- **Owner:** the user. It needs an ordinary browser: our tools cannot read these two pages.
- **Why:** T1 and T2 read two figures from search-engine copies of the provider's page, not from the page itself. The data says so in the `note` of each figure.
- **Input:** [APIDoc.md](APIDoc.md) ("Values from launch providers").
- **Do:**
  - Open [SpaceX's rideshare price tool](https://rideshare.spacex.com/search) and ask for 50 kg and 60 kg to sun-synchronous orbit. Expected: $350,000 and $420,000.
  - Open [Rocket Lab's Electron Payload User's Guide](https://rocketlabcorp.com/assets/Electron-Payload-User-Guide-7.0-v6.pdf). Expected: 200 kg to a 500 km sun-synchronous orbit.
  - If a figure differs, correct it in `data/launchers.curation.json`.
  - Remove the "still to be confirmed in a browser" sentence from both `note` fields, set `checked` to the day's date and rebuild with `--offline`.
- **Done when:**
  - Both figures are confirmed or corrected.
  - The two notes no longer say "still to be confirmed", and the open item in APIDoc.md is ticked.

---

## Foundation (M0)

### [ ] T4 – Create the monorepo foundation

- **Owner:** `platform-engineer`
- **Why:** No game code can be written until the monorepo exists. This is the platform part of milestone M0 in [tech.md](tech.md) section 7.
- **Input:** [tech.md](tech.md) sections 2, 5 and 7.
- **Do:**
  - Set up pnpm workspaces and Turborepo with a shared strict TypeScript config, linting and formatting.
  - Add a `.gitattributes` that keeps `*.json` and `*.ts` files on LF line endings, so generated data files do not change between Windows and other machines.
  - Add GitHub Actions CI that runs the type checks and tests of every package on every push.
  - Create the `apps/api` skeleton: Hono on Node and SQLite through Drizzle (`better-sqlite3`), with a first route and its test.
  - List every new dependency and its licence in the report, so `data-curator` can add them to CREDITS.md.
- **Done when:**
  - `pnpm install` and `pnpm dev` work from a clean clone and start the API (and the web app, once `web-developer` adds the app shell).
  - CI passes on push.
  - No Docker and no Python are needed.

### [ ] T5 – Move the data into `packages/data`

- **Owner:** `data-curator`
- **Needs:** T4.
- **Why:** [tech.md](tech.md) section 5 puts all game data in `packages/data`, validated with Zod. The data files are still in `data/` at the repo root.
- **Input:** `data/`, `scripts/fetch-launchers.ts`, [APIDoc.md](APIDoc.md) ("Fields we add").
- **Do:**
  - Move everything in `data/` to `packages/data`: the three launcher files and any T6 or T7 files written there. Update the paths in `scripts/fetch-launchers.ts` and APIDoc.md, and report any other place that still names the old path.
  - Write the Zod schema for a launcher, including `ssoCapacityKg`, `sources` and the rideshare-only fields.
  - Add a test in `packages/data` that validates `launchers.json` against the schema. The CI from T4 runs it.
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
- **Do:**
  - Read the subsystem chapters and type in representative parts for structure, power, batteries, onboard computer, attitude control, propulsion and communications.
  - Give each part its mass, power, cost, main performance value and TRL, in three tiers (basic / standard / advanced).
  - Record a source and a `data_quality` flag for every part, and say how each cost was derived.
  - Write the Zod schema for a part and a test that validates the file, once T5 is done.
- **Done when:**
  - There are 30–50 parts, with at least one per tier in every subsystem.
  - Parts exist in every TRL band of design.md section 1, including a few at TRL ≤ 4 that the first mission shows as locked.
  - Every part has a source, and CREDITS.md and APIDoc.md are updated.

### [ ] T7 – Curate the instruments (`instruments.json`)

- **Owner:** `data-curator`
- **Why:** Requirement R2, the night-detection bonus and the revisit-versus-sharpness trade-off all depend on the instrument ([design.md](design.md) section 4.3).
- **Input:** [NASA mission archive (NSSDCA)](https://nssdc.gsfc.nasa.gov/nmc/) and NASA mission pages, [tech.md](tech.md) section 3, [design.md](design.md) sections 1 and 4.3.
- **Open question for the user:** the report example in design.md section 1 has a "new-generation camera" that adds 9 months, so instruments need a TRL below 9. tech.md section 3 takes instruments from flown missions, which are all TRL 9. Decide whether a few not-yet-flown instruments are added, and from which source.
- **Do:**
  - Record real flown instruments with mass, power, data rate, cost, TRL, field of view (for swath width) and what each one can detect.
  - Tag each instrument with the objectives it serves. Science value per objective is our own game-design number, so mark it as one.
  - Record a source and a `data_quality` flag for every instrument, and say how each cost was derived.
  - Write the Zod schema for an instrument and a test that validates the file, once T5 is done.
- **Done when:**
  - There are 15–25 instruments.
  - Wildfire Watch has several real choices: daylight fire detection (R2), thermal infrared for night detection, and both narrow and wide fields of view.
  - Some instruments fit a 6U or 12U CubeSat and some need the ~150 kg satellite, so both spacecraft sizes on the mission card can be played.
  - Every instrument has a source, and CREDITS.md and APIDoc.md are updated.
