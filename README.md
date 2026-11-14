# Space Mission Design Game

An open-source, browser-based game where you design, manage and simulate a complete space mission – alone or as a team of up to four.

Choose a mission objective, build a spacecraft from real components, pick a launch vehicle and orbit, and balance **mass, power, budget, data, communications and time**. Then launch, survive random events, and get a post-mission report that explains *why* your mission succeeded or failed.

Built for the [NASA Space Apps Challenge 2026](https://www.spaceappschallenge.org/2026/challenges/space-mission-design-game/) – see [CHALLENGE.md](CHALLENGE.md).

> 🚧 **Status: early development.** The design and tech plan are written; code is coming next.

---

## Features (planned)

- **Mission phases** modelled on NASA JPL's Concept Maturity Levels: Idea → Feasibility → Trade Study → Point Design → Launch & Simulate.
- **Team play for up to 4** with roles based on NASA's mission segments: Launch, Spacecraft, Ground, Science. Solo players handle all four.
- **Real trade-offs:** every part changes mass, power, cost, data and development time. Newer technology performs better but takes longer and carries more risk.
- **Real data:** spacecraft parts from NASA's small spacecraft technology report, launch vehicles from Launch Library 2, interplanetary transfers and real missions from Orrery.
- **Live resource dashboard** showing the effect of every decision before you make it.
- **Mission simulation** with random events and a post-mission report, including "your design resembles real mission X".
- **Scenarios** from an easy CubeSat in low Earth orbit to a Mars orbiter with launch windows.
- **Nickname leaderboards** – no login, no personal data.

## Getting started

> These steps describe the planned setup and will work once the code is in place.

**Requirements:** Node.js, pnpm, Docker. Optional: [Claude Code](https://claude.com/claude-code) CLI for the AI Flight Director debrief.

```bash
pnpm install
supabase start   # local database (Docker)
pnpm dev         # web app + multiplayer server
```

Then open the URL shown in the terminal. For team play, open up to four browser windows, or have players on the same network join via your machine's local IP address.

## Project structure (planned)

```
apps/web        React web app (UI, dashboard, 3D view)
apps/server     Colyseus multiplayer server
packages/sim    Deterministic simulation and orbital mechanics
packages/data   Validated game data (parts, launchers, orbits, scenarios, missions)
scripts/        Offline scripts that convert source data to JSON
```

## Documentation

| Document | Contents |
|---|---|
| [design.md](design.md) | Game design: rules, roles, scenarios, scoring |
| [tech.md](tech.md) | Tech stack, architecture, reused tools and data |
| [CHALLENGE.md](CHALLENGE.md) | Original NASA Space Apps challenge text |
| [CREDITS.md](CREDITS.md) | Data sources, assets and libraries with their licences |

## Data sources

Main sources (full list with licences in [CREDITS.md](CREDITS.md)):

- [NASA State-of-the-Art of Small Spacecraft Technology 2024](https://www.nasa.gov/smallsat-institute/sst-soa) – spacecraft components and TRL
- [NASA CubeSat 101](https://www.nasa.gov/wp-content/uploads/2017/03/nasa_csli_cubesat_101_508.pdf) – CubeSat concepts
- [Launch Library 2 – The Space Devs](https://thespacedevs.com/) – launch vehicles
- [NASA Launch Services Program performance data](https://elvperf.ksc.nasa.gov/) – deep-space launch capability
- [Orrery](https://github.com/chipi/orrery) – orbital mechanics, launch windows and real-mission data
- [NASA GMAT](https://software.nasa.gov/) – trajectory validation
- [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources) – 3D models and textures

## License

Code: [MIT](LICENSE). Original content (texts, scenarios, tutorials): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Third-party material keeps its own licence – see [CREDITS.md](CREDITS.md).

## Disclaimer

This is an independent, open-source educational project created for the NASA Space Apps Challenge. It is not endorsed by NASA or any other space agency.
