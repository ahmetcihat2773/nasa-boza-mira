# Space Mission Design Game

An open-source game, running locally in your browser, where you design, manage and simulate a complete space mission – alone or as a team of up to four sharing one screen.

Take on a mission with a set objective, build a spacecraft from real components, pick a launch vehicle and orbit, and balance **mass, power, budget, data, communications and time**. Then launch, survive random events, and get a post-mission report that explains *why* your mission succeeded or failed.

Built for the [NASA Space Apps Challenge 2026](https://www.spaceappschallenge.org/2026/challenges/space-mission-design-game/) – see [CHALLENGE.md](CHALLENGE.md).

> 🚧 **Status: early development.** The design and tech plan are written; code is coming next.

---

## Features (planned)

- **First mission: Wildfire Watch** – design a satellite that detects wildfires early from low Earth orbit. More missions (Moon, Mars) are planned.
- **Mission phases** modelled on NASA JPL's Concept Maturity Levels: Briefing → Concept → Trade-offs → Design approval → Development → Launch → Operations → Results.
- **Team play for up to 4 on one PC** (hot-seat) with roles based on NASA's mission segments: Launch, Spacecraft, Ground, Science. Shared decisions are voted on in turn. Solo players handle all four roles.
- **Real trade-offs:** every part changes mass, power, cost, data and development time. Newer technology performs better but takes longer and carries more risk.
- **Real data:** spacecraft parts from NASA's small spacecraft technology report, launch vehicles from Launch Library 2, real Earth-observation satellites from NASA mission pages.
- **Live resource dashboard** showing the effect of every decision before you make it.
- **Mission simulation** with random events and a post-mission report, including "your design resembles real mission X".
- **Retry and compare:** fix your design and fly the same mission again with the same events.
- **Built-in learning:** tooltips, a glossary and a short first-play tour explain every concept in plain language.
- **Local nickname leaderboard** – no login, no personal data.

## Getting started

> The first playable screen (Wildfire Watch design and launch) works today; more of the game is being added.

**Requirements:** Node.js 22.12 or newer. pnpm 10 is pinned in `package.json`: if `pnpm` is not installed, use `npx --yes pnpm@10.34.9` instead of `pnpm` in the commands below. Optional: [Claude Code](https://claude.com/claude-code) CLI for the AI Flight Director debrief.

```bash
pnpm install
pnpm dev         # web app + local API (SQLite)
```

Then open http://localhost:5173. The local API runs on http://127.0.0.1:8787. Stop both with Ctrl+C.

For team play, players take turns on the same screen – the game shows whose role is up.

## Project structure

```
apps/web        React web app (UI, dashboard, 3D view)
apps/api        Small local API (SQLite storage, AI debrief)
packages/sim    Deterministic simulation and orbital mechanics
packages/data   Validated game data (parts, launchers, orbits, mission cards, events)
scripts/        Offline scripts that convert source data to JSON
```

## Documentation

| Document | Contents |
|---|---|
| [design.md](design.md) | Game design: rules, roles, the mission, scoring, events, game flow |
| [tech.md](tech.md) | Tech stack, architecture, reused tools and data |
| [APIDoc.md](APIDoc.md) | External APIs and data sources: what was checked and how each data file is produced |
| [CHALLENGE.md](CHALLENGE.md) | Original NASA Space Apps challenge text |
| [CREDITS.md](CREDITS.md) | Data sources, assets and libraries with their licences |

## Data sources

Main sources (full list with licences in [CREDITS.md](CREDITS.md)):

- [NASA State-of-the-Art of Small Spacecraft Technology 2024](https://www.nasa.gov/smallsat-institute/sst-soa) – spacecraft components and TRL
- [NASA CubeSat 101](https://www.nasa.gov/wp-content/uploads/2017/03/nasa_csli_cubesat_101_508.pdf) – CubeSat concepts
- [Launch Library 2 – The Space Devs](https://thespacedevs.com/) – launch vehicles
- [NASA mission archive (NSSDCA)](https://nssdc.gsfc.nasa.gov/nmc/) and mission pages – instruments and real missions
- [NASA GMAT](https://software.nasa.gov/) – validation of our orbit formulas
- [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources) – 3D models and textures

Planned for later Moon and Mars missions: [Orrery](https://github.com/chipi/orrery) (interplanetary trajectories, launch windows) and [NASA Launch Services Program performance data](https://elvperf.ksc.nasa.gov/).

## License

Code: [MIT](LICENSE). Original content (texts, scenarios, tutorials): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Third-party material keeps its own licence – see [CREDITS.md](CREDITS.md).

## Disclaimer

This is an independent, open-source educational project created for the NASA Space Apps Challenge. It is not endorsed by NASA or any other space agency.
