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

| Part TRL | Meaning | Development time | Failure risk |
|---|---|---|---|
| 9 | Flown many times | +0 months | Low |
| 7–8 | Demonstrated in space | +3 months | Medium |
| 5–6 | Tested in the lab only | +9 months | High |
| ≤ 4 | Prototype | Not available on easy; +18 months on hard | Very high |

- **Total development time** = mission class base time + sum of part penalties.
  - Base time: CubeSat ≈ 18 months · small satellite ≈ 36 months · large mission ≥ 60 months.
- **Trade-off:** lower-TRL parts perform better (lighter, more efficient, more data) but add time and risk.
- **Cost of time:** every development month costs the team's monthly cost from the budget.
- **Launch windows:** in scenarios with a window (e.g., Mars, every ~26 months – from Orrery's porkchop data), being late means waiting for the next window, which costs more months of budget.
- **Risk:** in the simulation, each part's failure probability depends on its TRL.

### In the UI
- The dashboard shows a **"Ready for launch" date** next to the other resources.
- Selecting a part shows its effect live, e.g. `+12 kg · +8 W · +$4M · +9 months`.
- The post-mission report explains the consequences, e.g.:
  > "The new-generation camera increased science value by 40%, but added 9 months of development. The launch window was missed and the 26-month wait cost $120M."

---

## 2. Player modes

**Status: decided.** Everything runs on **one PC**; there is no online or network play.

| Mode | Who | How |
|---|---|---|
| **Solo** | 1 player | Controls all four roles and switches freely between role tabs. |
| **Team (hot-seat)** | 2–4 players on the same screen | Each player takes a role. The screen shows whose turn it is (e.g., "Up next: Science – Alex"). With fewer than 4 players, the unassigned roles are shared out (2 players → 2 roles each). |

- **Shared decisions** (e.g., approving the mission objective, the launch Go / No-Go) are made by **voting in turn**: each role casts its vote, then the result is revealed together.
- The challenge asks for single-player and team play on the **same mission**, different responsibilities, and collective decisions ([CHALLENGE.md](CHALLENGE.md)) – both modes cover this.

### Roles
Based on NASA's four mission segments:

| Role | Owns |
|---|---|
| **Launch** | Launch vehicle, orbit / trajectory, launch window |
| **Spacecraft** | Structure, power, batteries, onboard computer, attitude control, propulsion |
| **Ground** | Communications, ground stations, data downlink |
| **Science** | Mission objective, scientific instruments |

How roles share resources and negotiate is defined in section 3.

---

## 3. Negotiation and resource allocation

**Status: decided.** The challenge asks for situations where team members *negotiate between competing priorities* and for results that depend on *how effectively the team coordinates* ([CHALLENGE.md](CHALLENGE.md)).

### 3.1 Resource allocations
At the start of a mission, the total resources (**budget, mass, power**) are split into an **allocation per role**, e.g.:

| Role | Example allocation |
|---|---|
| Spacecraft | 40% |
| Science | 35% |
| Ground | 15% |
| Launch | 10% |

Each role makes its choices within its own allocation. Exact percentages are set per scenario.

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

## 4. Scenarios
**Status: to be discussed.**

## 5. Scoring
**Status: to be discussed.**

## 6. Random events
**Status: to be discussed.**
