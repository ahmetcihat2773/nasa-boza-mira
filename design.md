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

## 2. Roles (solo and team play)
**Status: to be discussed.**

## 3. Role permissions and shared decisions
**Status: to be discussed.**

## 4. Scenarios
**Status: to be discussed.**

## 5. Scoring
**Status: to be discussed.**

## 6. Random events
**Status: to be discussed.**
