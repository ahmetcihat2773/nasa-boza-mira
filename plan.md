# Plan: Space Mission Design Game (24 hours)

## 1. What the brief asks for

Build an interactive game where players design, resource-manage and simulate a complete space mission, and learn from the trade-offs.

Reading the README, a strong submission has five things:

| # | Required piece | What it means for us |
|---|---|---|
| 1 | Mission configuration | Player picks an objective, then orbit, launch vehicle, spacecraft parts and instruments |
| 2 | Resource management | Mass, power, budget, data, communications and time are always visible and limited |
| 3 | Simulation and evaluation | The mission runs, gets a score, and the game explains *why* it succeeded or failed |
| 4 | Collaboration for 1–4 players | Different roles, shared resources, decisions made together |
| 5 | Clear, beginner-friendly UI | Concepts are explained in simple terms inside the game |

The idea the judges will look for is **every decision has a consequence somewhere else**, and **there is no single perfect design**. Everything optional (leaderboards, sandbox, 3D models, competitive mode, save/share) is out of scope unless we finish early.

## 2. The game

One mission is one room. Solo play is the same room with one player holding all four roles.

1. **Brief**: pick a scenario with a budget, a deadline and science targets.
2. **Design**: each role picks its parts. All roles draw on the same mass, power, budget and data pools.
3. **Review**: live checks show what fails and why, in plain language.
4. **Simulate**: the mission plays out over its lifetime with one or two random events.
5. **Report**: a score and an explanation, then redesign and retry.

### Roles

| Role | Owns | Bonus objective (creates negotiation) |
|---|---|---|
| Mission lead | Scenario, orbit, launch vehicle | Finish under 85% of budget |
| Spacecraft engineer | Structure, solar array, battery, attitude control, computer | Keep 20% mass and power margin |
| Science lead | Instruments | Maximise science value |
| Comms / operations | Antenna, ground stations, data storage | Downlink 100% of data generated |

Launch needs sign-off from every role. With fewer than four players, roles are shared out so all four are always covered.

### Scenarios

- **Wildfire Watch** (easy, build first): Earth observation from low orbit, small budget.
- **Lunar Mapper** (medium): heavier launcher needed, weaker comms link.
- **Mars Relay** (hard): long lifetime, low solar power, very low data rate.

Scenarios 2 and 3 are JSON only and get added only after the first one plays well end to end.

### Constraint checks

These are simplified on purpose. Each failed check shows a one-sentence reason and a hint.

| Check | Rule |
|---|---|
| Mass | Sum of part masses + 20% margin ≤ launcher capacity to the chosen orbit |
| Launcher reach | The launcher can deliver to the chosen orbit at all |
| Power | Solar array output × sunlit fraction of the orbit ≥ average load of all parts |
| Battery | Battery capacity ≥ load × eclipse duration |
| Data | Data generated per day ≤ downlink rate × contact time per day |
| Storage | Onboard storage ≥ data generated between ground contacts |
| Pointing | Attitude control accuracy meets the most demanding instrument |
| Budget | Parts + launcher + (operations cost per year × lifetime) ≤ budget |
| Lifetime | Planned lifetime ≤ what the orbit and part reliability allow |

### Simulation and score

- Time steps through the mission lifetime in months. Each step produces science data, limited by power and downlink.
- Random events: solar storm (needs radiation tolerance or loses an instrument), part failure (reliability roll), launch slip (costs budget), ground station outage (tests storage).
- Events use a seeded random generator, so a run can be replayed and tested.
- **Score out of 100**: science delivered (50), resource efficiency (20), reliability / survival (20), role bonus objectives (10).
- The report lists the three decisions that cost the most points and what to try next.

## 3. How we build it

- **Stack**: TypeScript, React and Vite. One package, not a monorepo, to save setup time.
- **Engine**: pure TypeScript in `src/engine`, no React or network code. Input is a mission design, output is check results, a simulation timeline and a score. This is the only part with unit tests (Vitest).
- **Catalog**: parts, orbits, launchers and scenarios in JSON under `src/catalog`. First version: 5 instruments, 3 orbits, 3 launchers, 2 options per spacecraft subsystem.
- **Multiplayer**: a small Node WebSocket relay in `server/` (about 100 lines). It holds room state as one JSON object and broadcasts changes. The engine runs in the browser, so the server knows nothing about the game.
- **Deploy**: client on a static host, relay on a free Node host. Deploy an empty version at hour 2 so hosting is never the last-minute problem.

## 4. Schedule

| Hours | Work | Done when |
|---|---|---|
| 0–2 | Agree scenario 1, catalog format and formulas. Scaffold repo, first deploy. | Blank app is live at a URL |
| 2–7 | Engine: types, all checks, score, with tests. First catalog. | Tests pass for a valid and a failing design |
| 7–13 | Single-player UI: scenario brief, design screen, live resource bars, review checks. | A mission can be designed and checks update live |
| 13–16 | Simulation playback, random events, mission report. | **Full solo loop is playable. This is the minimum submission.** |
| 16–20 | Multiplayer: rooms, role assignment, sync, sign-off. | Two browsers can design one mission together |
| 20–22 | Tooltips and short tutorial, scenarios 2 and 3, balance pass, bug fixing. | **Feature freeze at hour 20: no new features after this** |
| 22–24 | Final deploy, demo video, project page, submission. | Submitted with at least 30 minutes to spare |

### What to cut, in this order

1. Scenarios 2 and 3 (keep one polished scenario).
2. Simulation animation (show the timeline as a list instead).
3. Networked multiplayer: fall back to "shared screen, assigned roles" where each role's panel is locked behind a role switch and sign-off still applies. This still demonstrates collaboration.

Never cut: the live checks with explanations, and the report explaining why the mission succeeded or failed. Those carry the educational value.

## 5. Team split

Four lanes. With fewer people, merge lanes 3 and 4 into the others after hour 16.

1. **Engine and content**: formulas, catalog numbers, scoring, tests. Sanity-check numbers against the challenge's Resources tab.
2. **UI**: design screen, resource dashboard, report.
3. **Multiplayer and deploy**: relay server, sync, hosting. Until hour 16, helps on UI.
4. **Design and pitch**: scenario text, tooltips, visuals, demo video and submission page. Starts the pitch at hour 16, not hour 22.

The engine's input and output types are agreed in hours 0–2 so UI and engine can be built in parallel against mock data.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Numbers feel unrealistic or the game is trivially easy | One balance pass at hour 20 with a fresh player; keep all numbers in JSON |
| Multiplayer sync bugs eat the last hours | Server is a dumb relay; fallback to shared screen is decided at hour 19, not later |
| Too much text for beginners | One sentence per tooltip; explain failures at the moment they happen |
| Deploy fails at the end | Deploy at hour 2 and after every milestone |

## 7. First step

Scaffold the Vite + React + TypeScript app, write the catalog types, and implement the mass check (spacecraft mass against launcher capacity for the chosen orbit) with a test.
