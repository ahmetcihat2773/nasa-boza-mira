# Credits & Data Sources

This project's **code** is licensed under the [MIT License](LICENSE).
Original **content** we write (texts, scenario descriptions, tutorials) is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Third-party material listed below keeps its own licence.

> **Disclaimer:** This is an independent, open-source educational project created for the NASA Space Apps Challenge.
> It is not endorsed by NASA or any other space agency. NASA logos and insignia are not used.

Add every asset, dataset and library here **when it is added to the repo**. Entries marked "planned" are not in the repo yet.

---

## Data

| Source | Used for | Licence / terms | Credit |
|---|---|---|---|
| [NASA State-of-the-Art of Small Spacecraft Technology (2024)](https://www.nasa.gov/smallsat-institute/sst-soa) | Spacecraft part specs and TRL hints for `packages/data/json/parts.json` (figures only) | US Government work | NASA Small Spacecraft Systems Virtual Institute |
| [NASA CubeSat 101](https://www.nasa.gov/wp-content/uploads/2017/03/nasa_csli_cubesat_101_508.pdf) | CubeSat concepts and values; the "no propulsion" part | US Government work | NASA CubeSat Launch Initiative |
| [Launch Library 2 – The Space Devs](https://thespacedevs.com/) | Launch vehicle capacities and costs | Free to use and share; attribution encouraged, not required ([terms](https://github.com/TheSpaceDevs/Tutorials/blob/main/faqs/faq_TSD.md#terms-of-use)) | Data from Launch Library 2 by The Space Devs |
| [SpaceX Smallsat Rideshare Program](https://rideshare.spacex.com/search) | Rideshare launch price | Published price; figures only, no text or images copied | SpaceX |
| [Rocket Lab – Electron Payload User's Guide 7.0](https://rocketlabcorp.com/assets/Electron-Payload-User-Guide-7.0-v6.pdf) | Electron capacity to sun-synchronous orbit | Published figure; figures only, no text or images copied | Rocket Lab |
| [Firefly Aerospace – Alpha](https://fireflyspace.com/alpha/) | Firefly Alpha capacity to sun-synchronous orbit | Published figure; figures only, no text or images copied | Firefly Aerospace |
| [ISRO – Polar Satellite Launch Vehicle](https://www.isro.gov.in/PSLV_CON.html) | PSLV capacity to sun-synchronous orbit | Published figure; figures only, no text or images copied | Indian Space Research Organisation (ISRO) |
| [NASA mission archive (NSSDCA)](https://nssdc.gsfc.nasa.gov/nmc/) and NASA mission pages | Approximate orbit, mass and power of real missions in `missions.json` (figures only, own summaries; ESA, NOAA and DLR pages likewise); `instruments.json` uses representative values with no external source | US Government work | NASA |
| [NASA LSP Performance](https://elvperf.ksc.nasa.gov/) | Payload mass vs C3 (planned, later missions) | US Government work | NASA Launch Services Program |
| [NASA GMAT](https://software.nasa.gov/) | Offline trajectory data / validation | Apache-2.0 | NASA Goddard Space Flight Center |
| [DSN Telecommunications Link Design Handbook 810-005](https://deepspace.jpl.nasa.gov/dsndocs/810-005/) | Deep-space comms reference values (planned, later missions) | US Government work | NASA JPL |
| [EnduroSat product list prices](https://www.endurosat.com/products-category/antennas/) | Anchor prices for part costs in `parts.json` (structures, solar panels, computer, radios, antennas) | Published prices; figures only, no text or images copied | EnduroSat |
| [NanoAvionics component prices](https://nanoavionics.com/cubesat-components/cubesat-smallsat-battery-pack/) | Anchor prices for part costs (battery, computer, magnetorquer, reaction wheel) | Published starting prices; figures only | NanoAvionics |
| [satcatalog – Starling 1U](https://www.satcatalog.com/component/starling-1u/) | Anchor price for the cold-gas thruster part | Published average cost; figures only | satcatalog |
| [Aerospace Corp. SSCM19 paper](https://aerospace.org/sites/default/files/2020-05/SSCM19%20paper.pdf) | Read for the cost method; not used for numbers, because it publishes no cost formulas | Public paper | The Aerospace Corporation |

## Visual assets

| Asset | Source | Licence / terms | Credit line |
|---|---|---|---|
| _e.g., spacecraft GLB_ | [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources) | NASA media usage guidelines | _per-asset credit, e.g., "NASA/Christopher R. Meaney"_ |
| `apps/web/public/textures/earth-day.jpg` (2048×1024, resized) | NASA Blue Marble ("Whole world – land and oceans"), via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Whole_world_-_land_and_oceans_12000.jpg) | Public domain (US Government work) | NASA Goddard Space Flight Center / Visible Earth (Blue Marble) |
| `apps/web/public/textures/earth-night.jpg` (2048×1024, resized) | NASA Earth at Night (Black Marble 2012), via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:The_earth_at_night.jpg) | Public domain (US Government work) | NASA Earth Observatory / NOAA NGDC, Suomi NPP VIIRS |
| Rocket, launch pad, satellite, smoke and flame | Modelled in code (`apps/web/src/scene/`) | MIT (project code) | Project contributors |
| NASA Eyes on the Solar System (optional link) | [eyes.nasa.gov](https://eyes.nasa.gov/) | NASA | NASA/JPL-Caltech |

## Audio

| Asset | Source | Licence | Credit |
|---|---|---|---|
| | | | |

## Libraries

| Library | Licence |
|---|---|
| [Hono](https://github.com/honojs/hono) | MIT |
| [Orrery](https://github.com/chipi/orrery) – orbital mechanics modules and mission/porkchop data (planned, later missions) | MIT, © 2026 Marko Dragoljevic |
| [satellite.js](https://github.com/shashwatak/satellite-js) (planned extra) | MIT |
| [Zod](https://github.com/colinhacks/zod) – data validation | MIT |
| [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm) – database access | Apache-2.0 |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) – SQLite driver (bundles SQLite, public domain) | MIT |
| Development tools: Turborepo, TypeScript (Apache-2.0), ESLint, typescript-eslint, Prettier, Vitest, drizzle-kit | MIT unless noted |
| React, Zustand (web app) | MIT |
| [Three.js](https://github.com/mrdoob/three.js), [React Three Fiber](https://github.com/pmndrs/react-three-fiber), [drei](https://github.com/pmndrs/drei), [postprocessing](https://github.com/pmndrs/postprocessing), [@react-three/postprocessing](https://github.com/pmndrs/react-postprocessing) – 3D orbit view and launch | MIT (postprocessing: Zlib) |

## Licence rules for contributors

- Allowed: CC0, public domain, US Government works, CC BY, MIT, BSD, Apache-2.0.
- Avoid: CC BY-NC (blocks commercial reuse of the project), CC BY-ND (no modifications), GPL code copied into the repo.
- Never use NASA logos ("meatball", "worm") or imply endorsement.
