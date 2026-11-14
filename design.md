# Game Design – Space Mission Design Game

> What the game is and how it plays. For how it is built, see [tech.md](tech.md).
> Status: **first version complete** (one mission: Wildfire Watch). Numbers are starting values, to be tuned during balancing.

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
  - Base time is set **on the mission card**. Wildfire Watch: CubeSat 15 months · small satellite 24 months (deadline 30 months, so a small satellite is possible but leaves little room for low-TRL parts). Later, larger missions use longer base times (e.g., ≥ 60 months).
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

The three shared resources work differently, as in a real mission:

| Resource         | Fixed at the start?                      | Provided by                                              | Used by                                   |
| ---------------- | ---------------------------------------- | -------------------------------------------------------- | ----------------------------------------- |
| **Budget** | Yes – set on the mission card           | The mission                                              | All four roles                            |
| **Mass**   | No – depends on the launcher and orbit  | **Launch** (launch vehicle capacity to the orbit)  | Spacecraft, Science, Ground (comms parts) |
| **Power**  | No – depends on the power system        | **Spacecraft** (solar panels, batteries)           | Science, Ground (comms), Spacecraft       |

- **Budget** is split into an **allocation per role** at the start, e.g. Launch 35% · Spacecraft 30% · Science 25% · Ground 10%. Exact percentages are set per mission. Each role spends within its own allocation.
- **Mass and power are not split up front.** One role provides them and the others consume them. Providing more always costs something: a bigger launcher costs budget; more solar panels cost mass and budget.

### 3.2 Requests

A role opens a **request** when it needs more than is available:

- **More budget** than its allocation – the other roles vote in turn; if accepted, budget moves from another role's allocation.
- **More mass or power** than is currently provided – the request goes to the providing role, e.g.:
  > "Science requests +15 W for a second camera." → Spacecraft must add solar panels (+2 kg, +$0.4M), which may in turn need more mass capacity from Launch.

  The providing role accepts (and pays the cost from its own budget, or asks for budget in return) or rejects.
- **Rejected:** the requesting role must find another way (a lighter instrument, a different part, etc.).

The dashboard shows the full knock-on effect of a request before anyone votes.

### 3.3 Trades

A role can offer something in exchange:

> "Science gives $0.5M of its budget to Spacecraft, in return for +15 W."

The receiving role accepts or rejects.

### 3.4 Solo play

In solo play, requests are raised by **role advisors**, e.g. the Science advisor: "A second camera would increase science value by 30%." The player accepts or rejects – the same trade-offs, without other players.

### 3.5 Effect on scoring

Coordination counts towards the score (detailed in section 5):

- Accepted requests that **paid off** (e.g., the extra power enabled an instrument that produced science).
- The mission ending with **balanced resource use** (no role's budget exhausted, no large unused mass or power capacity).

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
| R1 | See the target region **at least once per day**                                         | Launch (orbit, altitude), Science (swath)   |
| R2 | Carry an instrument able to **detect active fires in daylight**                         | Science                                     |
| R3 | Downlink **≥ 1 GB of data per day**                                                    | Ground, Spacecraft (power)                  |
| R4 | Operate for **≥ 1 year**                                                               | Spacecraft, Launch (altitude → orbit decay) |
| R5 | Be **ready to launch before the next fire season** (development deadline, section 1) | All (TRL choices)                           |

**Constraints:**

| Constraint           | Starting value                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------- |
| Budget               | $30M (development + launch + operations)                                                    |
| Spacecraft size      | From a CubeSat (6U / 12U) up to a ~150 kg small satellite                                   |
| Number of satellites | **One** (constellations are a later feature)                                                |
| Base development time | CubeSat 15 months · small satellite 24 months (section 1)                                  |
| Development deadline | 30 months (next fire season) – missing it delays the mission by a year and costs budget     |
| Parts available      | TRL ≥ 5 (TRL ≤ 4 locked on easy)                                                          |
| Budget allocations   | Launch 35% · Spacecraft 30% · Science 25% · Ground 10% (section 3)                          |

**Bonus objectives (extra science score):**

- **Night detection** – a thermal infrared instrument, so fires are also seen at night (R2 only requires daylight detection).
- **Twice-daily revisit** – see the region at least twice per day.
- **Fast alerts** – deliver data to the ground within 1 hour of an observation (needs more ground station contacts).

**Key trade-offs this mission teaches:**

- **Power vs data:** a better camera needs more power and produces more data, but ground contact time is short.
- **Revisit vs sharpness (R1):** with one satellite, a daily revisit needs a wide swath – a wide-angle instrument or a higher orbit – and both give less sharp images. The sim computes revisit from swath width and altitude.
- **Altitude:** a lower orbit gives sharper images but decays sooner (R4).
- **Orbit type:** a sun-synchronous orbit passes at the same local time every day; other orbits may revisit more often.
- **Size and launch:** a CubeSat on a rideshare (cheap, limited) vs a small satellite on a dedicated launch (capable, expensive).
- **Technology vs time:** advanced parts improve performance but risk missing the fire season (R5).

**Real-mission comparison:** Earth-observation missions such as Landsat, Sentinel, GOES and Planet Labs (available in Orrery's data), plus NASA/NOAA fire-monitoring instruments – exact matches are picked when `missions.json` is curated.

---

## 5. Scoring

**Status: decided.** The challenge asks to reward *mission success, scientific value, efficient use of resources, effective decision making and successful collaboration* ([CHALLENGE.md](CHALLENGE.md)).

### 5.1 Success gate
All mission requirements (R1–R5 for Wildfire Watch) must be met.
- If any requirement fails, the mission is **failed**: no score, and the report explains the cause, e.g.:
  > "R3 not met: only 0.6 GB/day downlinked because a single ground station was selected."

### 5.2 Score (successful missions, 0–1000)

| Component | Weight | Measures |
|---|---|---|
| **Science value** | 40% | Instrument quality, bonus objectives met, data collected |
| **Resource efficiency** | 20% | Remaining budget and allocations – neither waste nor allocations run down to zero |
| **Schedule** | 15% | How early the mission was ready before its deadline |
| **Risk management** | 15% | Failures and events during the mission, and how the team responded |
| **Coordination** | 10% | Section 3.5: requests that paid off, balanced resource use |

- Weights are defined **on the mission card**, so later missions can use different weights.

### 5.3 Results screen
- Total score and a **star rating** (1–3 ⭐).
- Each component's score with a one-sentence explanation.
- Entry on the local **leaderboard** under the team's nickname.

---

## 6. Random events

**Status: decided.** The challenge suggests *random events or unexpected mission constraints* ([CHALLENGE.md](CHALLENGE.md)). Events **test the design's margins** and give the team **decision moments** (the "mission operator" idea from the Psyche games).

### 6.1 How events work
- Each run has **3–5 events**, drawn from the mission's event list using the run's **seed** – the same seed gives the same events, so designs can be compared fairly.
- Each event **checks a margin** in the design. A well-designed mission absorbs the event automatically.
- Some events require a **decision**, made by the affected role in its turn, or by a vote.
- Each event shows a short **"why does this happen?"** explanation.

### 6.2 Wildfire Watch events

| Phase | Event | Tests | Decision (if any) |
|---|---|---|---|
| Development | **Supplier delay** | Schedule margin | Buy a more expensive alternative part (budget) **or** accept the delay (time) |
| Development | **Test failure** | Low-TRL parts | Re-test the part (+time) **or** swap to a proven part (−performance) |
| Launch | **Launch delay** (weather, rocket) | Margin to the deadline | — |
| Operations | **Solar storm** | Power margin, radiation tolerance | Enter safe mode (lose 2 days of science) **or** keep operating (failure risk) |
| Operations | **Space debris approach** | Fuel / propulsion | Avoidance manoeuvre (uses fuel) **or** take the risk |
| Operations | **Part failure** | TRL-based probability, redundancy | Switch to backup (if any) **or** continue degraded |
| Operations | **Ground station outage** | Communications margin (R3) | Rent an extra station (budget) **or** accept the data backlog |
| Operations | **Major fire season** | Data capacity | Increase observations (more data and power) – a high-science opportunity |

### 6.3 Effect on scoring and the report
- Events and the team's responses feed the **risk management** score component (section 5).
- The post-mission report shows them as a cause chain, e.g.:
  > "During the solar storm you entered safe mode and protected the main camera."

### 6.4 Difficulty
On easy, events are rarer and milder. When difficulty levels are added later, the same event list is used with higher frequency and stronger effects.

---

## 7. Game flow

**Status: decided.** The phases follow NASA JPL's Concept Maturity Levels and the NASA Mission Design Lab study types: Concept, Trade-offs and Design approval correspond to feasibility, trade study and point design.

| Phase | What happens | Who acts |
|---|---|---|
| **0. Setup** | Choose mode (solo / team), enter nicknames, assign roles | Everyone |
| **1. Briefing** | The mission card: objective, requirements (R1–R5), constraints, budget allocations | Everyone reads |
| **2. Concept** | Each role makes its first choices in its own area. The dashboard shows conflicts but does not block them. | Roles in turn |
| **3. Trade-offs** | Requests, trades and votes (section 3). Roles change their choices. As many rounds as the team wants. | Roles in turn |
| **4. Design approval** | Final check: status of every requirement, and that mass and orbit are compatible with the launcher. | Vote |
| **5. Development** | Time advances; development events arrive (section 6). | Affected role decides |
| **6. Launch** | Go / No-Go vote, then the launch sequence. | Vote |
| **7. Operations** | Mission time runs accelerated; operations events arrive. | Affected role decides |
| **8. Results** | Score, post-mission report, real-mission comparison, leaderboard (section 5). | Everyone |

- In **solo** play the same phases run; the player acts for every role, and votes become a single confirmation.
- The design can be approved with unmet requirements – the team is warned, and the mission will then fail with an explanation. Learning from failure is part of the game.

---

## 8. Replay and comparison

**Status: decided.** The challenge suggests letting participants *modify their mission design and simulate it multiple times*.

From the results screen:

- **Fix the design and retry** – the **same seed**, so the same events occur and the design is the only difference.
- **New attempt** – a new seed with different events.
- **Compare** – the last two attempts side by side: design choices, resources, score components.

Every attempt is saved locally (SQLite) with its design, seed and result.

---

## 9. Learning layer

**Status: decided.** The challenge asks for a game accessible to different knowledge levels, with concepts explained in simple terms and introduced through the game itself.

- **Tooltips:** every technical term (TRL, sun-synchronous orbit, downlink, swath, …) shows a one-sentence plain-language explanation on hover or focus.
- **Glossary:** all terms on one page, with "learn more" links to NASA sources (e.g., Basics of Space Flight, CubeSat 101).
- **First-play tour:** a short, skippable introduction (5–6 steps) on first launch: the mission card, roles, the dashboard, making a choice, requests, launching.
- **"Why?" explanations:** on locked options, on every event, and throughout the post-mission report – the game explains *why* a decision affects the mission, not only whether it was right.
- All texts are in English and written by `data-curator` in `packages/data`, so they can be reviewed and sourced like other data.
