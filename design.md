# Game Design – Space Mission Design Game

> What the game is and how it plays. For how it is built, see [tech.md](tech.md).
> Status: **in progress** – sections are filled in as design decisions are made.

---

## 1. Development time & technology readiness (TRL)

**Status: decided.**

### Why

The challenge lists *Time: the planned development and operational lifetime of the mission* as a core resource. Without development time, the most advanced part is always the best choice and there is no trade-off. In real missions, new technology costs **time and risk**.

Time therefore has two parts in the game:

```
[ Development ] ──► [ Launch ] ──► [ Operations / mission lifetime ]
 design, build,                     time working in space
 test on the ground                 (fuel, orbit decay, radiation)
```

### Data

Every part in `parts.json` carries a **TRL (Technology Readiness Level, 1–9)** taken from the [NASA State-of-the-Art of Small Spacecraft Technology 2024](https://www.nasa.gov/smallsat-institute/sst-soa) report.

### Rules

| Part TRL | Meaning                | Development time                          | Failure risk |
| -------- | ---------------------- | ----------------------------------------- | ------------ |
| 9        | Flown many times       | +0 months                                 | Low          |
| 7–8     | Demonstrated in space  | +3 months                                 | Medium       |
| 5–6     | Tested in the lab only | +9 months                                 | High         |
| ≤ 4     | Prototype              | Not available on easy; +18 months on hard | Very high    |

- **Total development time** = mission class base time + sum of part penalties.
  - Base time: CubeSat ≈ 18 months · small satellite ≈ 36 months · large mission ≥ 60 months.
- **Trade-off:** lower-TRL parts perform better (lighter, more efficient, more data) but add time and risk.
- **Cost of time:** every development month costs the team's monthly cost from the budget.
- **Deadlines and launch windows:** every mission has a "ready by" date. In Wildfire Watch it is the next fire season; in later missions such as Mars it is a launch window (every ~26 months, from Orrery's porkchop data). Being late means waiting for the next opportunity, which costs more months of budget.
- **Risk:** in the simulation, each part's failure probability depends on its TRL.

### In the UI

- The dashboard shows a **"Ready for launch" date** next to the other resources.
- Selecting a part shows its effect live, e.g. `+12 kg · +8 W · +$4M · +9 months`.
- The post-mission report explains the consequences, e.g.:
  > "The new-generation camera increased science value by 40%, but added 9 months of development. The launch window was missed and the 26-month wait cost $120M."
  >

---

## 2. Player modes

**Status: decided.** Everything runs on **one PC**; there is no online or network play.

| Mode                      | Who                             | How                                                                                                                                                                                         |
| ------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Solo**            | 1 player                        | Controls all four roles and switches freely between role tabs.                                                                                                                              |
| **Team (hot-seat)** | 2–4 players on the same screen | Each player takes a role. The screen shows whose turn it is (e.g., "Up next: Science – Alex"). With fewer than 4 players, the unassigned roles are shared out (2 players → 2 roles each). |

- **Shared decisions** (e.g., approving the final mission design, the launch Go / No-Go) are made by **voting in turn**: each role casts its vote, then the result is revealed together.
- The challenge asks for single-player and team play on the **same mission**, different responsibilities, and collective decisions ([CHALLENGE.md](CHALLENGE.md)) – both modes cover this.

### Roles

Based on NASA's four mission segments:

| Role                 | Owns                                                                        |
| -------------------- | --------------------------------------------------------------------------- |
| **Launch**     | Launch vehicle, orbit / trajectory, launch window                           |
| **Spacecraft** | Structure, power, batteries, onboard computer, attitude control, propulsion |
| **Ground**     | Communications, ground stations, data downlink                              |
| **Science**    | Scientific instruments; tracks the mission's science requirements           |

How roles share resources and negotiate is defined in section 3.

---

## 3. Negotiation and resource allocation

**Status: decided.** The challenge asks for situations where team members *negotiate between competing priorities* and for results that depend on *how effectively the team coordinates* ([CHALLENGE.md](CHALLENGE.md)).

### 3.1 Resource allocations

At the start of a mission, the total resources (**budget, mass, power**) are split into an **allocation per role**, e.g.:

| Role       | Example allocation |
| ---------- | ------------------ |
| Spacecraft | 40%                |
| Science    | 35%                |
| Ground     | 15%                |
| Launch     | 10%                |

Each role makes its choices within its own allocation. Exact percentages are set per mission.

### 3.2 Requests

If a role wants to go over its allocation, it opens a **request**, e.g.:

> "Science requests +15 W for a second camera."

The other roles vote on it in turn:

- **Accepted:** the resource moves from another role's allocation.
- **Rejected:** the requesting role must find another way (a lighter instrument, a different part, etc.).

### 3.3 Trades

A role can offer part of its own allocation in exchange:

> "Ground gives 5 kg, asks for 10 W in return."

The receiving role accepts or rejects.

### 3.4 Solo play

In solo play, requests are raised by **role advisors**, e.g. the Science advisor: "A second camera would increase science value by 30%." The player accepts or rejects – the same trade-offs, without other players.

### 3.5 Effect on scoring

Coordination counts towards the score (detailed in section 5):

- Accepted requests that **paid off** (e.g., the extra power enabled an instrument that produced science).
- The mission ending with **balanced resource use** (no role starved, no large unused reserves).

---

## 4. Missions

**Status: decided.**

### 4.1 Model

- **The game defines the objective; the player designs the mission.** Each mission is a fixed **mission card** with an objective, requirements and constraints.
- **Requirements** decide success: if a required item is not met, the mission fails and the report explains why. If they are met, the score comes from science value, efficiency, schedule and coordination (section 5).
- There is still **no single perfect solution**: many combinations of parts, orbits and launchers can meet the same requirements.

### 4.2 Scope

- **First version: one mission – Wildfire Watch.** It covers every core trade-off with Earth-orbit physics only and has the richest data (NASA CubeSat 101, SST-SOA).
- **After a working prototype:** Lunar Ice Hunter (medium), Mars Climate Orbiter (hard – uses Orrery's interplanetary modules and launch windows), Europa (expert), sandbox.

### 4.3 Mission card: Wildfire Watch

> All numbers below are **starting values** and will be tuned during balancing.

| Field                    | Value                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Difficulty**     | Easy                                                                                                                     |
| **Objective**      | Detect wildfires early from space over a target region                                                                   |
| **Why it matters** | Early detection gives firefighters hours instead of days; satellites can watch remote areas no tower or patrol covers |
| **Destination**    | Low Earth orbit (LEO) – the player picks the orbit type and altitude                                                    |

**Requirements (all must be met):**

| #  | Requirement                                                                                  | Main roles involved                         |
| -- | -------------------------------------------------------------------------------------------- | ------------------------------------------- |
| R1 | See the target region **at least once per day**                                         | Launch (orbit)                              |
| R2 | Carry an instrument able to **detect active fires**                                     | Science                                     |
| R3 | Downlink **≥ 1 GB of data per day**                                                    | Ground, Spacecraft (power)                  |
| R4 | Operate for **≥ 1 year**                                                               | Spacecraft, Launch (altitude → orbit decay) |
| R5 | Be **ready to launch before the next fire season** (development deadline, section 1) | All (TRL choices)                           |

**Constraints:**

| Constraint           | Starting value                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------- |
| Budget               | $30M (development + launch + operations)                                                    |
| Spacecraft size      | From a CubeSat (6U / 12U) up to a ~150 kg small satellite                                   |
| Development deadline | 30 months (next fire season) – missing it delays the mission by a year and costs budget     |
| Parts available      | TRL ≥ 5 (TRL ≤ 4 locked on easy)                                                          |
| Role allocations     | Set per mission (section 3)                                                                 |

**Bonus objectives (extra science score):**

- **Night detection** – thermal infrared instrument, so fires are seen 24 hours a day.
- **Twice-daily revisit** – see the region at least twice per day.
- **Fast alerts** – deliver data to the ground within 1 hour of an observation (needs more ground station contacts).

**Key trade-offs this mission teaches:**

- **Power vs data:** a better camera needs more power and produces more data, but ground contact time is short.
- **Altitude:** a lower orbit gives sharper images but decays sooner (R4).
- **Orbit type:** a sun-synchronous orbit passes at the same local time every day; other orbits may revisit more often.
- **Size and launch:** a CubeSat on a rideshare (cheap, limited) vs a small satellite on a dedicated launch (capable, expensive).
- **Technology vs time:** advanced parts improve performance but risk missing the fire season (R5).

**Real-mission comparison:** NASA/NOAA fire-monitoring instruments and dedicated wildfire satellites – exact matches are picked from `missions.json` when the data is curated.

## 5. Scoring

**Status: to be discussed.**

## 6. Random events

**Status: to be discussed.**
