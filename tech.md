# Tech Stack & Reuse Plan – Space Mission Design Game

> NASA Space Apps Challenge 2026 – "Space Mission Design Game"
> Project type: **open source (MIT), educational**.
> Principle: **don't reinvent the wheel**. Reuse existing NASA/agency data, open-source libraries and proven tools; build only what nothing else covers.

---

## 1. TL;DR

**Stack:** TypeScript monorepo (pnpm + Turborepo).

- `packages/sim` – deterministic, seeded simulation and orbital-mechanics engine; runs in the browser.
- `packages/data` – Zod-validated JSON game data (parts, instruments, launchers, orbits, mission cards, events, real missions, texts).
- `apps/web` – React + Vite + React Three Fiber + Tailwind/shadcn/ui + visx.
- `apps/api` – small local Node service (Hono): SQLite storage and the `claude -p` Flight Director.
- Storage – SQLite + Drizzle ORM (a single local file).
- **Local only, one PC:** solo play or hot-seat team play (2–4 players sharing one screen). No online deployment. The hackathon submission is a recorded video.
- `scripts/` – TypeScript, run **offline** to convert real NASA and industry data into JSON (one language across the whole repo).

**Top 5 time-saving resources (first version, Wildfire Watch):**

1. **NASA State-of-the-Art of Small Spacecraft Technology (2024)** – real specs for every subsystem, ready to become the parts catalogue. [Landing page](https://www.nasa.gov/smallsat-institute/sst-soa) · [PDF](https://www.nasa.gov/wp-content/uploads/2025/02/soa-2024.pdf)
2. **Launch Library 2 API (The Space Devs)** – launch vehicles with `leo_capacity`, `gto_capacity`, `launch_cost` and launch counts, as JSON. Already imported into `data/launchers.json` (see [APIDoc.md](APIDoc.md)). [Example record](https://ll.thespacedevs.com/2.2.0/config/launcher/324/?format=api)
3. **NASA CubeSat 101** – CubeSat sizes, limits and concepts for the builder and the tooltips. [PDF](https://www.nasa.gov/wp-content/uploads/2017/03/nasa_csli_cubesat_101_508.pdf)
4. **NASA mission archive (NSSDCA) and mission pages** – real instruments and about 15 real Earth-observation satellites for the "your design resembles mission X" comparison. [NSSDCA](https://nssdc.gsfc.nasa.gov/nmc/)
5. **NASA 3D Resources** – spacecraft models and Earth textures for the 3D view. [GitHub](https://github.com/nasa/NASA-3D-Resources)

**Reserved for later missions (M4, Moon and Mars):** [Orrery](https://github.com/chipi/orrery) (MIT – Kepler, Lambert, porkchop grids, deep-space missions; see section 4), the [NASA LSP Performance website](https://elvperf.ksc.nasa.gov/) and the DSN handbook. **Optional, needs internet:** [NASA Eyes](https://science.nasa.gov/eyes/museums) as a link to a real mission in 3D.

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Repo | pnpm workspaces + Turborepo | Shared types across web, API, sim and data packages |
| Language | TypeScript (strict) + Zod | One language everywhere; JSON game data validated at load |
| Simulation | `packages/sim`: pure TS, seeded RNG, Vitest | Deterministic, replayable runs; tested balance; framework-independent |
| Orbital math | **First version:** our own Earth-orbit formulas (period, eclipse, decay, revisit, ground contact), cross-checked against GMAT. **M4:** [Orrery](https://github.com/chipi/orrery)'s Kepler, Lambert and porkchop modules (vendored, MIT) for Moon and Mars missions | Wildfire Watch needs Earth orbits only; Orrery's interplanetary code is added when a mission needs it |
| Real satellites (extra, M5) | satellite.js + CelesTrak TLE data | Show the ISS and real satellites in the LEO view, after the core game is done |
| Frontend | React + Vite, Zustand, Tailwind + shadcn/ui, Framer Motion | Fast way to a polished interface |
| Charts | visx (D3-based) | Custom mission-control gauges |
| 3D | React Three Fiber + drei + postprocessing | Orbits, launch sequence, spacecraft model |
| Players | **Hot-seat on one PC** – game state in Zustand; role turns and voting handled in the UI | No network code; solo and team play use the same flow |
| Local API | [Hono](https://hono.dev/) on Node | Tiny HTTP service for SQLite and for running `claude -p`, which the browser cannot do |
| Database | **SQLite** + Drizzle (`better-sqlite3`) | Saved designs, runs, nickname leaderboard – one file, no Docker |
| Running | **Local only** – `pnpm dev` starts everything (see section 5) | The submission is a video recorded on one PC |
| Quality | Vitest (sim), Playwright (main game path), GitHub Actions CI | Main flow tested on every push |
| AI layer (optional) | "Flight Director" narrating the post-mission report, run with **Claude Code headless mode (`claude -p`)** via the local API | The sim decides outcomes; the LLM only explains them. The game works without it |

**Engines considered:** Godot is viable, but the game is mostly dashboards and forms, so a web stack running locally in the browser wins. Unity WebGL and Bevy are not worth the load times or build friction.

---

## 3. Reuse map

| Game feature | Existing resource | Integration | Licence | What we build |
|---|---|---|---|---|
| Parts catalogue (power, batteries, radios, OBC, ADCS, propulsion, structure) | [NASA SST-SOA 2024](https://www.nasa.gov/smallsat-institute/sst-soa) + [NASA CubeSat 101](https://www.nasa.gov/wp-content/uploads/2017/03/nasa_csli_cubesat_101_508.pdf) (challenge resource) | Extract representative values into `parts.json` | US Government work | ~30–50 parts in 3 tiers (basic / standard / advanced) |
| Scientific instruments (mass, power, data rate, science value) | Instruments of real flown missions: NASA NSSDCA experiment entries and NASA mission pages (e.g., cameras, spectrometers, magnetometers, radar) | Curate ~15–25 representative instruments into `instruments.json`, each tagged with the objectives it serves | US Government work (facts) | Science value per objective, locking rules |
| Launch vehicles | [Launch Library 2](https://ll.thespacedevs.com/2.2.0/config/launcher/75/?format=api) | Script → `launchers.json` (handle null capacities). Free tier: 15 requests/hour per IP, so fetch once and commit the JSON | Free to use and share; attribution encouraged, not required ([terms](https://github.com/TheSpaceDevs/Tutorials/blob/main/faqs/faq_TSD.md#terms-of-use)) – we credit The Space Devs | **Done:** 10 curated vehicles + a hand-written rideshare entry in `data/launchers.json` ([APIDoc.md](APIDoc.md)). **Open:** verify the rideshare price against a published price list; source a capacity reduction factor for sun-synchronous orbit |
| Deep-space launch capability | [NASA LSP Performance](https://elvperf.ksc.nasa.gov/) | **M4 (deep-space missions only):** copy several mass-vs-C3 points per vehicle | US Government | Interpolation in `sim` |
| Earth orbits (LEO, SSO, GEO, Moon) | Standard orbital formulas; GMAT (challenge resource) for validation | **Offline** TS script computes delta-v, periods and eclipse fractions → `orbits.json`; selected values cross-checked manually in GMAT (also Orrery's interplanetary values) | GMAT: Apache-2.0 | Orbit option table |
| Real satellites in LEO view | satellite.js + CelesTrak TLEs | npm + fetch (cache locally) | MIT / free | ISS fly-by (M5 extra) |
| Power, eclipse, decay | Standard formulas (solar flux ∝ 1/r², eclipse geometry, decay table by altitude) | Implemented in `sim` | — | Formulas + tests |
| Comms and ground segment | NASA SST-SOA 2024 communications chapter (radios, data rates, ground networks); [DSN Link Design Handbook 810-005](https://deepspace.jpl.nasa.gov/dsndocs/810-005/) for deep-space missions in M4 | Simplified link budget (Friis) + ground contact minutes/day by orbit and number of stations | US Government | Data backlog model |
| Revisit / coverage (R1) | Standard geometry: swath width from instrument field of view and altitude; revisit from swath, orbit and target latitude | Implemented in `sim` | — | Formulas + tests |
| Cost | [Aerospace SSCM19 paper](https://aerospace.org/sites/default/files/2020-05/SSCM19%20paper.pdf), [NASA cost models overview](https://www.nasa.gov/sites/default/files/atoms/files/saing_nasa_and_smallsat_cost_estimation_overview_and_model_tools_s3vi_webinar_series_10_jun_2020.pdf) | Simplify published mass-based cost relationships | Paper public; model tool restricted | Cost formula per subsystem |
| Interplanetary transfers, launch windows | [Orrery](https://github.com/chipi/orrery) Lambert solver, Kepler ephemeris, porkchop grids | **M4 (Lunar / Mars missions):** copy selected modules into `packages/sim/vendor/orrery/` (see section 4). Not needed for Wildfire Watch | MIT | Wrappers + tests |
| Real-mission matching | NASA mission pages and NSSDCA: about 15 real Earth-observation satellites, curated by hand. Orrery's mission data is for deep-space missions in M4 (its Earth missions are crewed flights, not science satellites). NASA telescope learning game (idea) | Hand-written `missions.json` with a source per entry | US Government work (facts) | Nearest-neighbour matcher |
| 3D models and textures | [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources), [Satellite kit](https://science.nasa.gov/3d-resources/satellite-kit/) | GLB → React Three Fiber | NASA media guidelines + per-asset credit line ([example](https://nasa3d.arc.nasa.gov/detail/saturn-v)) | Scene, launch animation |
| Mission visualisation | [NASA Eyes embed](https://science.nasa.gov/eyes/museums) | **Optional, needs internet:** link or iframe with `?embed=true&locked=true`; the game must work without it | NASA | Pick deep link per mission |
| Game phases and roles | JPL CML paper, NASA MDL, "Design and Develop Science Missions" (challenge resources) | Structure for game flow and explanations | — | Phase screens and explanation texts |
| Tutorials, tooltips, glossary | [NASA/JPL "Basics of Space Flight"](https://science.nasa.gov/learn/basics-of-space-flight), [NASA CubeSat 101](https://www.nasa.gov/wp-content/uploads/2017/03/nasa_csli_cubesat_101_508.pdf), Orrery's glossary pattern | Link as "learn more"; write our own short explanations | US Government work | Plain-language texts for every resource and decision |

### Too heavy to use live (use offline or cite)

- **GMAT** – generate trajectory data offline; cite it as the validation source.
- **NASA PCEC / NICM** – available only to NASA staff, contractors and approved requesters ([PCEC](https://www.nasa.gov/ocfo/ppc-corner/pcec-project-cost-estimating-capability), [NICM](https://software.nasa.gov/software/HQN-11886-1)). Use published papers instead.
- **Aerospace SSCM** tool – free to eligible requestors only ([SSCM](https://aerospace.org/sscm)); use the public paper.
- **Orekit, CesiumJS** – too heavy for our needs.

---

## 4. Existing projects: decisions

We reviewed each candidate's licence, stack and activity (checked November 2026). We will not clone any existing game: we reuse **code and data only where the licence allows**, and take **design ideas** from the rest.

> **Licence rule:** a repository with **no licence file is "all rights reserved"**. Its code cannot be copied, even if it is public on GitHub. We may only study it for ideas.

### Summary

| Project | Licence | Stack / status | Decision |
|---|---|---|---|
| [Orrery](https://github.com/chipi/orrery) | **MIT** | TypeScript, SvelteKit, Three.js · very active | ✅ **Reuse code + data from M4** (selected modules, not a fork); not used in the first version |
| [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources) | NASA media guidelines | GLB/3DS models, textures · active | ✅ **Reuse assets** |
| [NASA telescope learning game](https://science.nasa.gov/?p=367433) | NASA site (no code) | Web game | 💡 **Design reference** |
| [Psyche "Captain of the Spacecraft"](https://psyche.ssl.berkeley.edu/?p=13715) / [Psyche Simulator](https://psyche.asu.edu/get-involved/capstone-projects/capstone-projects-tungsten-class/web-based-game-psyche-simulator-asu) | No code available | Web games | 💡 **Design reference** |
| [UniSat Game](https://gamelab-kbtu.itch.io/unisat-game) ([repo](https://github.com/Kazakh-British-Technical-University/unisat-game)) | **None** | Godot (GDScript) · inactive since 2024 | 💡 **Design reference only**, no code |
| [The Oregon Trajectory](https://2015.spaceappschallenge.org/project/the-oregon-trajectory/) / [Start to Finish NASA Mission](https://2015.spaceappschallenge.org/project/start-to-finish-nasa-mission) (Space Apps 2015) | Unknown | Hackathon projects | 💡 **Design reference** |
| [rocket-simulation](https://github.com/chintanboghara/rocket-simulation) | **None** | Python/Flask · inactive since 2025 | ❌ **Skip** (no licence; overlaps with Orrery) |
| [runYourOwnSpaceCompany](https://github.com/maowman/runYourOwnSpaceCompany) | **None** | Svelte · archived 2021 | ❌ **Skip** |

### ✅ Orrery – code and data for later missions (M4)

**Not used in the first version.** Wildfire Watch needs Earth orbits only. Everything below applies when Moon and Mars missions are added.

Orrery is an MIT-licensed, browser-based solar system explorer and mission simulator ("real Keplerian orbital mechanics, real missions from Luna 9 to Artemis"). Live at [orrerylearn.com](https://www.orrerylearn.com).

**Why not fork it:** Orrery is a very large SvelteKit app (~45k files, mobile apps, i18n, AR). Our game is a different product built on React. Forking would bring in a lot of code we don't need. Instead, we **copy selected, self-contained modules and datasets** into our repo.

**What we take and how:**

| What | Orrery path | Use in our game | How |
|---|---|---|---|
| Kepler ephemeris | `src/lib/physics/ephemeris/kepler.ts` | Planet positions, orbit drawing | Copy into `packages/sim/vendor/orrery/` |
| Lambert solver | `src/lib/physics/transfer/lambert.ts` | Interplanetary transfer delta-v and time of flight for Mars / outer-planet scenarios and sandbox | Copy (no imports – standalone) |
| Orbital mechanics helpers | `src/lib/physics/mechanics/orbits.ts`, `transfer/orbital.ts`, `transfer/orbit-insertion*.ts` | Orbit insertion burns, Hohmann-style transfers | Copy, wrap behind our `sim` API |
| Porkchop logic + precomputed grids | `src/lib/porkchop.ts`, `static/data/porkchop/*.json` (22 destinations) | Launch-window choice: a bad date costs extra delta-v | Copy grids into `packages/data`; show a simple porkchop view |
| Real missions | `static/data/missions/**` (113 missions with destination, launcher, transit time, delta-v, `data_quality` flag) | "Your design resembles mission X" matcher for Moon and Mars missions | Import script → our `missions.json` (fields we need only) |
| Launcher list | `static/data/fleet/launcher/*.json` (39 vehicles) | Names, images, mission links | Merge with **Launch Library 2** – Orrery's launcher files do not contain payload capacities |
| Patterns (no code) | `data_quality` honesty flag, ajv data validation with licence allowlist, per-image provenance / `/credits` page | Show how reliable each number is; validate our data in CI | Re-implement in our Zod schemas and CREDITS |

**Rules for using Orrery code:**
- Keep Orrery's MIT copyright notice in `packages/sim/vendor/orrery/LICENSE` and list it in [CREDITS.md](CREDITS.md).
- Record the source commit hash in `vendor/orrery/README.md` so we can pull updates later.
- Write our own Vitest tests around the copied modules (e.g., Earth→Mars Hohmann delta-v ≈ known values).
- Mission JSON `links` point to Wikipedia and other sites. We copy **facts only** (dates, delta-v, destination), not descriptive text, because Wikipedia text is CC BY-SA.
- Optional: from the post-mission report, link "Explore the real mission in Orrery" (check its URL format first).

### ✅ NASA 3D Resources – models and textures

- **Use:** spacecraft and planet models and textures for the 3D view and launch sequence. Start with the [satellite kit](https://science.nasa.gov/3d-resources/satellite-kit/) for modular spacecraft parts.
- **How:** convert to GLB where needed, optimise with `gltf-transform`, load in React Three Fiber.
- **Terms:** NASA media usage guidelines – no endorsement, no NASA insignia; copy each asset's credit line into CREDITS.md.

### 💡 Design references (ideas only, no code or assets)

**NASA telescope learning game**
- Take: choices that don't fit the objective are **locked with an explanation**; 3 levels of growing complexity (one objective → several objectives); the ending **compares your design with real NASA missions**.
- Our version: the matcher uses our curated list of real missions; locked options explain *why* (e.g., "This camera needs 40 W – your power system provides 25 W").

**Psyche "Captain of the Spacecraft" / Psyche Simulator**
- Take: the player as **mission operator** making decisions during flight, tied to a real NASA mission.
- Our version: the simulation phase shows random events (solar storm, component failure) where the team decides how to respond.

**UniSat Game**
- Take: **assembling a nanosatellite from modules** as a hands-on, visual way to learn subsystems.
- Our version: the builder shows parts snapping into a 6U / 12U CubeSat frame. We design and draw this ourselves.

**Space Apps 2015: The Oregon Trajectory / Start to Finish NASA Mission**
- Take: a journey-style mission timeline (Oregon Trajectory) and a full mission lifecycle from concept to operation (Start to Finish).
- Our version: the game's phases follow JPL Concept Maturity Levels from idea to operations, with a visual timeline.

### ❌ Skipped

- **rocket-simulation:** no licence, so its code can't be reused; Orrery covers the same physics under MIT.
- **runYourOwnSpaceCompany:** archived and unlicensed.

### Our gap

None of these projects combines **mission design + resource trade-offs + team roles + simulation with explanations**. That combination is what we build. Orrery will supply interplanetary physics when later missions need it.

---

## 5. Architecture

```
scripts/ (offline)                  packages/data  (Zod-validated JSON)
  LL2 API → launchers.json    ──►     parts, instruments, launchers,
  formulas → orbits.json (GMAT-checked) orbits, mission cards,
  NASA pages → missions.json (manual) events, missions, texts
  SST-SOA → parts.json (manual)             │
                                            │
                                            ▼
apps/web (React, R3F, visx) ◄──── packages/sim (deterministic, seeded)
  hot-seat roles, voting,                   runs in the browser
  NASA 3D GLBs
        │  HTTP (localhost)
        ▼
apps/api (Hono, Node) ──► SQLite file (designs, runs, leaderboard)
        └──► claude -p  (Flight Director debrief, optional)
```

- Data is fetched or curated once, offline, and committed as JSON, so the running game never depends on external APIs. How each file is produced is recorded in [APIDoc.md](APIDoc.md).
- The existing `data/` and `scripts/` folders at the repo root move into this layout when the monorepo is created.
- The sim runs entirely in the browser; the API only stores results and calls Claude.

### Running locally

Everything runs on **one PC**; there is no online version.

```
pnpm install
pnpm dev              # web (Vite) + local API, in parallel via Turborepo
```

- **Requirements:** Node and pnpm. Optional: the Claude Code CLI for the Flight Director. No Docker needed.
- **Player modes (same screen):**
  - **Solo:** one player controls all four roles.
  - **Team (hot-seat):** 2–4 players share the PC, each controlling one role (with fewer than 4 players, some take two roles). The screen shows whose turn it is.
- **Shared decisions:** each role votes in turn on the same screen; the result is revealed together.
- **No login:** players pick a **nickname**; no personal data is stored.

### AI Flight Director (`claude -p`)

- After a run, the web app sends the sim's **result + cause chain (JSON)** to the local API, which runs `claude -p` and returns a short, plain-language debrief.
- The sim result is shown **immediately**; the narration appears when ready (it takes a few seconds).
- **Fallback:** if the Claude CLI is not installed or fails, a template-based debrief is shown from the same cause chain. The open-source game must work without it.
- Run it with no tools enabled and a fixed prompt file, so it only writes text.
- **Competitive mode**: out of scope for now (see D6).

---

## 6. What we build ourselves

- `sim`: budgets, validation, events, scoring, cause chain
- Curating `parts.json`, `instruments.json`, `launchers.json`, `orbits.json`, `missions.json`
- Mission builder UI + live deltas + dashboard
- Hot-seat flow: role turns, role permissions, voting
- Local API: SQLite storage, `claude -p` wrapper
- 3D orbit view + launch sequence
- Post-mission report + mission matcher
- Tutorial, glossary, explanation texts, mission card and events
- Docs, demo video, presentation

---

## 7. Roadmap (milestone-based)

M1–M3 are built around a **single mission, Wildfire Watch** (Earth orbit only – see [design.md](design.md) section 4). More missions follow in M4, once the prototype works.

| Milestone | Sim | Web | Data & Server | Visuals |
|---|---|---|---|---|
| **M0 – Foundation** | `sim` API, Zod schemas | App shell | Monorepo, CI, local API skeleton + SQLite; move the existing `data/` and `scripts/` into the monorepo layout | Style guide |
| **M1 – Single-player loop** | Budgets, R1–R4 validation, launcher checks (mass, orbit, cost), Earth-orbit formulas (period, eclipse, decay, revisit, ground contact), TRL and development time | Builder + dashboard | Launchers (done: verify rideshare price, add sun-synchronous capacity factor), SST-SOA parts with TRL, instruments, Wildfire Watch mission card | R3F scene with NASA GLBs |
| **M2 – Simulation & feedback** | Events incl. launch failure, deadline penalty, scoring, cause chains, tests | Results and report screen, retry / compare, leaderboard, tooltips, glossary, first-play tour | ~15 curated real missions + matcher; save attempts and nickname leaderboard in SQLite | Launch animation; optional NASA Eyes link |
| **M3 – Team play (hot-seat)** | Role-based validation, budget allocations, requests and trades | Player setup, role turns, voting UI | Save runs per team | Turn / role indicators |
| **M4 – Content & balance** | More missions (Lunar, Mars): vendor Orrery's interplanetary modules, NASA LSP C3 data, DSN values; difficulty levels, sandbox | Export / import designs | Data for the new missions | Sound, polish |
| **M5 – Extras** | — | Accessibility | AI Flight Director (`claude -p`) + template fallback | Real satellites (ISS) in LEO view |
| **M6 – Presentation** | GMAT validation slide | Project page | CREDITS + data sources | Demo video + slides |

---

## 8. Winning strategy

- Judging criteria: **Impact, Creativity, Validity, Relevance, Presentation** ([Submission guide](https://www.spaceappschallenge.org/resources/project-submission-guide/), [Judging guide](https://www.spaceappschallenge.org/resources/judging-awards-guide)). Teams often neglect Presentation – give it equal weight.
- **Validity:** cite every number's source on the project page (launchers: Launch Library 2; parts: NASA SST-SOA 2024; real missions: NASA mission pages). Include a slide comparing sim values with GMAT.
- **Relevance:** make the challenge resources visible – game phases based on the CML stages and MDL study types, and the 4 mission segments as team roles.
- **Creativity:** role negotiation + "why it failed" cause chains + "your design resembles Landsat" ending.
- **Avoid:** live external API calls during the demo, 3D work crowding out core gameplay, last-minute submission.

---

## 9. Licensing (open source, MIT)

### Our code and content
- **Code: [MIT License](LICENSE)** – anyone may use, modify and redistribute it, including commercially, as long as the copyright notice is kept. Chosen for maximum reuse by students and educators.
- **Content we write** (texts, scenario descriptions, tutorials): **CC BY 4.0**.
- All third-party material is tracked in [CREDITS.md](CREDITS.md).

### Third-party material
- Prefer CC0, public domain, US Government works, CC BY, MIT, BSD and Apache-2.0.
- Avoid **CC BY-NC** (conflicts with MIT's commercial-reuse freedom) and **CC BY-ND** (no modifications).
- GPL libraries may be used as separate dependencies only; never copy GPL code into the repo.

### NASA material
- [ ] No NASA logos or insignia; no implied endorsement – add a disclaimer ([NASA 3D Resources notes](https://github.com/nasa/NASA-3D-Resources)).
- [ ] Use each NASA asset's own credit line.
- [ ] Some NASA images contain third-party content – check each credit.

### Checklist
- [x] `LICENSE` file for code (MIT)
- [x] `CREDITS.md` created – keep it updated as assets, datasets and libraries are added
- [x] "Data sources" section in README
- [ ] "Data sources" section on the Space Apps project page
- [x] Launch Library 2 checked: free, 15 requests/hour; terms: free to use and share, attribution encouraged – we credit The Space Devs
- [ ] MIT credits for Hono, satellite.js and Orrery, each when it is added to the repo

---

## 10. Decisions

| # | Topic | Decision |
|---|---|---|
| D1 | Hosting | **Local only, never online.** Everything runs on one PC; the submission is a video. |
| D2 | Leaderboard identity | **Nicknames only**, no login and no personal data. |
| D3 | Game language | **English.** |
| D4 | AI Flight Director | **Claude Code headless mode (`claude -p`)**, with a template-based fallback so the game works without it. |
| D5 | Database | **SQLite** (one local file, via Drizzle). No Docker, no Supabase. |
| D6 | Competitive mode (team vs team) | **Out of scope for now.** [CHALLENGE.md](CHALLENGE.md) lists it only as an optional idea. Can be added later as asynchronous competition (same mission + seed, compared on the local leaderboard). Cooperative team mode (up to 4) stays. |
| D7 | Data scripts language | **TypeScript only.** No Python; GMAT is used manually for validation. |
| D8 | Real satellites (satellite.js) | **Moved to M5 extras**; revisit after the core game is done. |
| D9 | Player modes | **One PC, hot-seat.** Solo (one player, all four roles) or team (2–4 players on the same screen, one role each). No network multiplayer – Colyseus removed. Shared decisions by voting in turn. |
| D10 | Development team | **Six Claude Code agents** defined in `.claude/agents/`: `platform-engineer`, `sim-engineer`, `data-curator`, `web-developer`, `visuals-developer`, `reviewer` (read-only). All use the session's model. The main session coordinates: it assigns tasks, has `reviewer` check each result, and reports to the user, who makes the commits. Agents working in parallel use separate git worktrees. |

## Sources

[Participant FAQ](https://www.spaceappschallenge.org/resources/participant-faqs/) ·
[SST-SOA](https://www.nasa.gov/smallsat-institute/sst-soa) ·
[SST-SOA 2024 PDF](https://www.nasa.gov/wp-content/uploads/2025/02/soa-2024.pdf) ·
[SSCM](https://aerospace.org/sscm) ·
[SSCM19 paper](https://aerospace.org/sites/default/files/2020-05/SSCM19%20paper.pdf) ·
[NASA cost models webinar](https://www.nasa.gov/sites/default/files/atoms/files/saing_nasa_and_smallsat_cost_estimation_overview_and_model_tools_s3vi_webinar_series_10_jun_2020.pdf) ·
[PCEC](https://www.nasa.gov/ocfo/ppc-corner/pcec-project-cost-estimating-capability) ·
[NICM](https://software.nasa.gov/software/HQN-11886-1) ·
[NASA LSP Performance](https://elvperf.ksc.nasa.gov/) ·
[Launch Library 2](https://ll.thespacedevs.com/2.2.0/config/launcher/324/?format=api) ·
[DSN 810-005](https://deepspace.jpl.nasa.gov/dsndocs/810-005/) ·
[NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources) ·
[Satellite kit](https://science.nasa.gov/3d-resources/satellite-kit/) ·
[Eyes embed how-to](https://www.vaticanobservatory.org/sacred-space-astronomy/nasas-web-based-eyes-apps-are-great-educational-tools/) ·
[Eyes deep links](https://science.nasa.gov/eyes/museums) ·
[Hono](https://hono.dev/) ·
[Judging guide](https://www.spaceappschallenge.org/resources/judging-awards-guide) ·
[Submission guide](https://www.spaceappschallenge.org/resources/project-submission-guide/) ·
[UniSat Game](https://gamelab-kbtu.itch.io/unisat-game) ·
[Psyche game](https://psyche.ssl.berkeley.edu/?p=13715) ·
[Psyche Simulator](https://psyche.asu.edu/get-involved/capstone-projects/capstone-projects-tungsten-class/web-based-game-psyche-simulator-asu) ·
[Telescope game](https://science.nasa.gov/?p=367433) ·
[Orrery](https://github.com/chipi/orrery) ·
[The Oregon Trajectory](https://2015.spaceappschallenge.org/project/the-oregon-trajectory/) ·
[Start to Finish NASA Mission](https://2015.spaceappschallenge.org/project/start-to-finish-nasa-mission)
