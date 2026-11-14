# Tech Stack & Reuse Plan – Space Mission Design Game

> NASA Space Apps Challenge 2026 – "Space Mission Design Game"
> Project type: **open source (MIT), educational**.
> Principle: **don't reinvent the wheel**. Reuse existing NASA/agency data, open-source libraries and proven tools; build only what nothing else covers.

Items marked *(unverified)* could not be confirmed during research and should be checked before relying on them.

---

## 1. TL;DR

**Stack:** TypeScript monorepo (pnpm + Turborepo).

- `packages/sim` – deterministic, seeded simulation and orbital-mechanics engine, shared by client and server.
- `packages/data` – Zod-validated JSON game data (parts, launchers, orbits, scenarios, events, real missions).
- `apps/web` – React + Vite + React Three Fiber + Tailwind/shadcn/ui + visx.
- `apps/server` – Colyseus authoritative multiplayer server.
- Storage – Supabase (Postgres) + Drizzle ORM, run locally via the Supabase CLI.
- Runs **locally** with one command; the hackathon submission is a recorded video.
- `scripts/` – Python, run **offline** to convert real NASA and industry data into JSON.

**Top 5 time-saving resources:**

1. **NASA State-of-the-Art of Small Spacecraft Technology (2024)** – real specs for every subsystem, ready to become the parts catalogue. [Landing page](https://www.nasa.gov/smallsat-institute/sst-soa) · [PDF](https://www.nasa.gov/wp-content/uploads/2025/02/soa-2024.pdf)
2. **Launch Library 2 API (The Space Devs)** – launch vehicles with `leo_capacity`, `gto_capacity`, `launch_cost` and launch counts, as JSON. [Example record](https://ll.thespacedevs.com/2.2.0/config/launcher/324/?format=api)
3. **NASA LSP Performance website** – official payload mass vs C3 (launch energy) curves for deep-space launch checks. [elvperf.ksc.nasa.gov](https://elvperf.ksc.nasa.gov/)
4. **Orrery** (MIT, TypeScript) – ready-made Kepler ephemeris, Lambert solver, precomputed porkchop grids and 113 real missions (see section 4). [GitHub](https://github.com/chipi/orrery)
5. **NASA Eyes on the Solar System, embeddable** – add `?embed=true` to an Eyes URL to show a real mission in an iframe (e.g., for the "your design resembles mission X" moment). [How-to](https://www.vaticanobservatory.org/sacred-space-astronomy/nasas-web-based-eyes-apps-are-great-educational-tools/) · [Deep-link examples](https://science.nasa.gov/eyes/museums)

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Repo | pnpm workspaces + Turborepo | Shared types and simulation across client and server |
| Language | TypeScript (strict) + Zod | One language everywhere; JSON game data validated at load |
| Simulation | `packages/sim`: pure TS, seeded RNG, Vitest | Identical results on client and server; replayable runs; tested balance |
| Orbital math | [Orrery](https://github.com/chipi/orrery)'s Kepler, Lambert and porkchop modules (vendored, MIT); our own small additions for Earth orbits (J2, drag/decay) | One ephemeris source keeps planet positions and porkchop grids consistent; real computation enables a sandbox with custom orbits; validated against GMAT |
| Real satellites (optional) | satellite.js + CelesTrak TLE data | Show the ISS and real satellites in the LEO scenario |
| Frontend | React + Vite, Zustand, Tailwind + shadcn/ui, Framer Motion | Fast way to a polished interface |
| Charts | visx (D3-based) | Custom mission-control gauges |
| 3D | React Three Fiber + drei + postprocessing | Orbits, launch sequence, spacecraft model |
| Multiplayer | Colyseus | Authoritative rooms, delta state sync, reconnection, `maxClients = 4`; server runs the sim so competitive mode and leaderboards can't be cheated |
| Database | Supabase (Postgres) + Drizzle · **local via Supabase CLI** | Saved designs, runs, nickname leaderboards; same code locally and online |
| Running | **Local first** (one command starts everything, see section 5) · optional 24-hour online deploy: web on Vercel, server on Railway / Fly.io, Supabase cloud | Submission is a video, so the demo is recorded locally |
| Quality | Vitest (sim), Playwright (main game path), GitHub Actions CI | Main flow tested on every push |
| AI layer (optional) | "Flight Director" narrating the post-mission report, run with **Claude Code headless mode (`claude -p`)** on the server | The sim decides outcomes; the LLM only explains them. The game works without it |

**Engines considered:** Godot is viable, but the game is mostly dashboards and forms and must open instantly from a link, so a web stack wins. Unity WebGL and Bevy are not worth the load times or build friction.

---

## 3. Reuse map

| Game feature | Existing resource | Integration | Licence | What we build |
|---|---|---|---|---|
| Parts catalogue (power, batteries, radios, OBC, ADCS, propulsion, structure) | [NASA SST-SOA 2024](https://www.nasa.gov/smallsat-institute/sst-soa) + NASA CubeSat 101 (challenge resource) | Extract representative values into `parts.json` | US Government work | ~30–50 parts in 3 tiers (basic / standard / advanced) |
| Scientific instruments (mass, power, data rate, science value) | Instruments of real flown missions: NASA NSSDCA experiment entries and NASA mission pages (e.g., cameras, spectrometers, magnetometers, radar) | Curate ~15–25 representative instruments into `instruments.json`, each tagged with the objectives it serves | US Government work (facts) | Science value per objective, locking rules |
| Launch vehicles | [Launch Library 2](https://ll.thespacedevs.com/2.2.0/config/launcher/75/?format=api) | Python script → `launchers.json` (handle null capacities) | Check LL2 terms *(unverified)* | ~10 curated vehicles + rideshare option |
| Deep-space launch capability | [NASA LSP Performance](https://elvperf.ksc.nasa.gov/) | Copy several mass-vs-C3 points per vehicle | US Government | Interpolation in `sim` |
| Earth orbits (LEO, SSO, GEO, Moon) | GMAT (challenge resource), astropy | **Offline**: generate delta-v, periods and eclipse fractions → `orbits.json`; GMAT also validates Orrery's interplanetary values | Apache-2.0 / BSD | Orbit option table |
| Real satellites in LEO view | satellite.js + CelesTrak TLEs | npm + fetch (cache locally) | MIT / free | Optional ISS fly-by |
| Power, eclipse, decay | Standard formulas (solar flux ∝ 1/r², eclipse geometry, decay table by altitude) | Implemented in `sim` | — | Formulas + tests |
| Comms and ground segment | [DSN Link Design Handbook 810-005](https://deepspace.jpl.nasa.gov/dsndocs/810-005/) | Simplified link budget (Friis) + ground contact minutes/day | US Government | Data backlog model |
| Cost | [Aerospace SSCM19 paper](https://aerospace.org/sites/default/files/2020-05/SSCM19%20paper.pdf), [NASA cost models overview](https://www.nasa.gov/sites/default/files/atoms/files/saing_nasa_and_smallsat_cost_estimation_overview_and_model_tools_s3vi_webinar_series_10_jun_2020.pdf) | Simplify published mass-based cost relationships | Paper public; model tool restricted | Cost formula per subsystem |
| Interplanetary transfers, launch windows | [Orrery](https://github.com/chipi/orrery) Lambert solver, Kepler ephemeris, porkchop grids | Copy selected modules into `packages/sim/vendor/orrery/` (see section 4) | MIT | Wrappers + tests |
| Real-mission matching | [Orrery](https://github.com/chipi/orrery) mission data (113 missions); NASA NSSDCA; NASA telescope learning game (idea) | Import script → `missions.json` | MIT (facts only) | Nearest-neighbour matcher |
| 3D models and textures | [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources), [Satellite kit](https://science.nasa.gov/3d-resources/satellite-kit/) | GLB → React Three Fiber | NASA media guidelines + per-asset credit line ([example](https://nasa3d.arc.nasa.gov/detail/saturn-v)) | Scene, launch animation |
| Mission visualisation | [NASA Eyes embed](https://science.nasa.gov/eyes/museums) | iframe with `?embed=true&locked=true` | NASA | Pick deep link per scenario |
| Multiplayer rooms | [Colyseus](https://docs.colyseus.io/) | `npm create colyseus-app@latest` | MIT | Room schema, roles, intents |
| Game phases and roles | JPL CML paper, NASA MDL, "Design and Develop Science Missions" (challenge resources) | Structure for game flow and explanations | — | Phase screens and explanation texts |
| Tutorials, tooltips, glossary | NASA/JPL "Basics of Space Flight" *(check current URL)*, NASA CubeSat 101, Orrery's glossary pattern | Link as "learn more"; write our own short explanations | US Government work | Plain-language texts for every resource and decision |

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
| [Orrery](https://github.com/chipi/orrery) | **MIT** | TypeScript, SvelteKit, Three.js · very active | ✅ **Reuse code + data** (selected modules, not a fork) |
| [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources) | NASA media guidelines | GLB/3DS models, textures · active | ✅ **Reuse assets** |
| [NASA telescope learning game](https://science.nasa.gov/?p=367433) | NASA site (no code) | Web game | 💡 **Design reference** |
| [Psyche "Captain of the Spacecraft"](https://psyche.ssl.berkeley.edu/?p=13715) / [Psyche Simulator](https://psyche.asu.edu/get-involved/capstone-projects/capstone-projects-tungsten-class/web-based-game-psyche-simulator-asu) | No code available | Web games | 💡 **Design reference** |
| [UniSat Game](https://gamelab-kbtu.itch.io/unisat-game) ([repo](https://github.com/Kazakh-British-Technical-University/unisat-game)) | **None** | Godot (GDScript) · inactive since 2024 | 💡 **Design reference only**, no code |
| [The Oregon Trajectory](https://2015.spaceappschallenge.org/project/the-oregon-trajectory/) / [Start to Finish NASA Mission](https://2015.spaceappschallenge.org/project/start-to-finish-nasa-mission) (Space Apps 2015) | Unknown | Hackathon projects | 💡 **Design reference** |
| [rocket-simulation](https://github.com/chintanboghara/rocket-simulation) | **None** | Python/Flask · inactive since 2025 | ❌ **Skip** (no licence; overlaps with Orrery) |
| [runYourOwnSpaceCompany](https://github.com/maowman/runYourOwnSpaceCompany) | **None** | Svelte · archived 2021 | ❌ **Skip** |

### ✅ Orrery – our main code and data source

Orrery is an MIT-licensed, browser-based solar system explorer and mission simulator ("real Keplerian orbital mechanics, real missions from Luna 9 to Artemis"). Live at [orrerylearn.com](https://www.orrerylearn.com).

**Why not fork it:** Orrery is a very large SvelteKit app (~45k files, mobile apps, i18n, AR). Our game is a different product built on React. Forking would bring in a lot of code we don't need. Instead, we **copy selected, self-contained modules and datasets** into our repo.

**What we take and how:**

| What | Orrery path | Use in our game | How |
|---|---|---|---|
| Kepler ephemeris | `src/lib/physics/ephemeris/kepler.ts` | Planet positions, orbit drawing | Copy into `packages/sim/vendor/orrery/` |
| Lambert solver | `src/lib/physics/transfer/lambert.ts` | Interplanetary transfer delta-v and time of flight for Mars / outer-planet scenarios and sandbox | Copy (no imports – standalone) |
| Orbital mechanics helpers | `src/lib/physics/mechanics/orbits.ts`, `transfer/orbital.ts`, `transfer/orbit-insertion*.ts` | Orbit insertion burns, Hohmann-style transfers | Copy, wrap behind our `sim` API |
| Porkchop logic + precomputed grids | `src/lib/porkchop.ts`, `static/data/porkchop/*.json` (22 destinations) | Launch-window choice: a bad date costs extra delta-v | Copy grids into `packages/data`; show a simple porkchop view |
| Real missions | `static/data/missions/**` (113 missions with destination, launcher, transit time, delta-v, `data_quality` flag) | "Your design resembles mission X" matcher and post-mission comparison | Import script → our `missions.json` (fields we need only) |
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
- Our version: the matcher uses Orrery's 113 missions; locked options explain *why* (e.g., "This camera needs 40 W – your power system provides 25 W").

**Psyche "Captain of the Spacecraft" / Psyche Simulator**
- Take: the player as **mission operator** making decisions during flight, tied to a real NASA mission.
- Our version: the simulation phase shows random events (solar storm, component failure) where the team decides how to respond.

**UniSat Game**
- Take: **assembling a nanosatellite from modules** as a hands-on, visual way to learn subsystems.
- Our version: the CubeSat scenario's builder shows parts snapping into a 1U/3U/6U frame. We design and draw this ourselves.

**Space Apps 2015: The Oregon Trajectory / Start to Finish NASA Mission**
- Take: a journey-style mission timeline (Oregon Trajectory) and a full mission lifecycle from concept to operation (Start to Finish).
- Our version: the game's phases follow JPL Concept Maturity Levels from idea to operations, with a visual timeline.

### ❌ Skipped

- **rocket-simulation:** no licence, so its code can't be reused; Orrery covers the same physics under MIT.
- **runYourOwnSpaceCompany:** archived and unlicensed.

### Our gap

None of these projects combines **mission design + resource trade-offs + team roles + simulation with explanations**. Orrery covers the physics and real-mission data; we build the game around it.

---

## 5. Architecture

```
scripts/ (offline)                  packages/data  (Zod-validated JSON)
  LL2 API → launchers.json    ──►     parts, instruments, launchers,
  GMAT/astropy → orbits.json          orbits, porkchops, scenarios,
  Orrery → missions + porkchops       events, missions
  SST-SOA → parts.json (manual)             │
                                    packages/sim/vendor/orrery (MIT physics)
                                            │
                                            ▼
apps/web (React, R3F, visx) ◄── packages/sim (deterministic, seeded) ──► apps/server (Colyseus)
  single-player runs sim locally            ▲                              │
  + NASA Eyes iframe, NASA 3D GLBs          └──────── same code ───────────┘
                                                                           ▼
                                                              Postgres (designs, runs, leaderboard)
```

- Data is generated at build time, so the running game never depends on external APIs.

### Running locally (primary)

The hackathon submission is a **video**, so the game is built to run fully on one laptop:

```
pnpm install
supabase start        # local Supabase (Postgres) in Docker
pnpm dev              # web (Vite) + Colyseus server + sim, in parallel via Turborepo
```

- **Requirements:** Node, pnpm, Docker (for Supabase CLI), and optionally the Claude Code CLI for the Flight Director.
- **Team mode on video:** open 4 browser windows side by side, or let 4 people on the same Wi-Fi join via the laptop's local IP.
- **Config:** one `.env` switches between local Supabase and Supabase cloud; no code changes.
- **No login:** players pick a **nickname**; no personal data is stored.

### Online (optional, ~24 hours)

If we want a public link during judging: web → Vercel, Colyseus → Railway / Fly.io, database → Supabase cloud free tier. Cost for one day is negligible. Shut everything down afterwards; the GitHub repo and video remain the permanent deliverables.

### AI Flight Director (`claude -p`)

- After a run, the server sends the sim's **result + cause chain (JSON)** to `claude -p` and gets back a short, plain-language debrief.
- The sim result is shown **immediately**; the narration appears when ready (it takes a few seconds).
- **Fallback:** if the Claude CLI is not installed or fails, a template-based debrief is shown from the same cause chain. The open-source game must work without it.
- Run it with no tools enabled and a fixed prompt file, so it only writes text.
- Online: the server host must have the Claude CLI installed and authenticated; otherwise leave it local-only.
- **Single-player** runs the sim in the browser (works offline).
- **Team mode**: Colyseus room; each role edits only its part of the design; the server validates intents and broadcasts state.
- **Competitive mode**: two rooms, same scenario, same seed.

---

## 6. What we build ourselves

- `sim`: budgets, validation, events, scoring, cause chain
- Curating `parts.json`, `instruments.json`, `launchers.json`, `orbits.json`, `missions.json`
- Mission builder UI + live deltas + dashboard
- Colyseus room: roles, intents, validation
- 3D orbit view + launch sequence
- Post-mission report + mission matcher
- Tutorial, explanation texts, scenarios
- Docs, demo video, presentation

---

## 7. Roadmap (milestone-based)

| Milestone | Sim | Web | Data & Server | Visuals |
|---|---|---|---|---|
| **M0 – Foundation** | `sim` API, Zod schemas | App shell | Monorepo, CI, deploy | Style guide |
| **M1 – Single-player loop** | Budgets, validation, Kepler/Hohmann | Builder + dashboard | LL2 script, SST-SOA parts, LSP C3 points | R3F scene with NASA GLBs |
| **M2 – Simulation & feedback** | Events, scoring, cause chains, tests | Report screen, tutorial | Mission matcher | Launch animation, Eyes embed |
| **M3 – Team play** | Role-based validation | Lobby, role UI | Colyseus rooms + roles | Presence indicators |
| **M4 – Content & balance** | Scenarios, difficulty levels, sandbox | Share / compare designs | Postgres leaderboard | Sound, polish |
| **M5 – Extras** | Competitive mode | Accessibility, mobile | Optional 24-hour online deploy | AI Flight Director (`claude -p`) + template fallback |
| **M6 – Presentation** | GMAT validation slide | Project page | CREDITS + data sources | Demo video + slides |

---

## 8. Winning strategy

- Judging criteria: **Impact, Creativity, Validity, Relevance, Presentation** ([Submission guide](https://www.spaceappschallenge.org/resources/project-submission-guide/), [Judging guide](https://www.spaceappschallenge.org/resources/judging-awards-guide)). Teams often neglect Presentation – give it equal weight.
- **Validity:** cite every number's source on the project page (launchers: Launch Library 2 + NASA LSP; parts: NASA SST-SOA 2024). Include a slide comparing sim values with GMAT.
- **Relevance:** make the challenge resources visible – CML phase names, MDL study types, the 4 mission segments as team roles, a NASA Eyes embed.
- **Creativity:** role negotiation + "why it failed" cause chains + "your design resembles Juno" ending.
- **Avoid:** live external API calls during the demo, 3D work crowding out core gameplay, multiplayer without a single-player fallback, last-minute submission.

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
- [ ] "Data sources" section in README and on the project page
- [ ] Launch Library 2 terms checked and The Space Devs credited *(unverified)*
- [ ] MIT credits for Orrery, Colyseus, satellite.js

---

## 10. Decisions

| # | Topic | Decision |
|---|---|---|
| D1 | Hosting | **Local first.** The submission is a video. An online deploy is optional and runs for about 24 hours only, so cost is negligible. |
| D2 | Leaderboard identity | **Nicknames only**, no login and no personal data. |
| D3 | Game language | **English.** |
| D4 | AI Flight Director | **Claude Code headless mode (`claude -p`)**, with a template-based fallback so the game works without it. |
| D5 | Database | **Supabase**, run locally with the Supabase CLI (Docker); Supabase cloud only for the optional online deploy. |

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
[Colyseus docs](https://docs.colyseus.io/) ·
[Judging guide](https://www.spaceappschallenge.org/resources/judging-awards-guide) ·
[Submission guide](https://www.spaceappschallenge.org/resources/project-submission-guide/) ·
[UniSat Game](https://gamelab-kbtu.itch.io/unisat-game) ·
[Psyche game](https://psyche.ssl.berkeley.edu/?p=13715) ·
[Psyche Simulator](https://psyche.asu.edu/get-involved/capstone-projects/capstone-projects-tungsten-class/web-based-game-psyche-simulator-asu) ·
[Telescope game](https://science.nasa.gov/?p=367433) ·
[Orrery](https://github.com/chipi/orrery) ·
[The Oregon Trajectory](https://2015.spaceappschallenge.org/project/the-oregon-trajectory/) ·
[Start to Finish NASA Mission](https://2015.spaceappschallenge.org/project/start-to-finish-nasa-mission)
