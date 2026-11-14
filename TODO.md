# TODO

Tasks for the Space Mission Design Game. Each task names the agent that owns it (see `.claude/agents/`), what it needs, what it produces, and how we know it is done.

Status: `[ ]` open · `[~]` in progress · `[x]` done

---

## Data

### [ ] T1 – Verify the rideshare price

- **Owner:** `data-curator`
- **Why:** The rideshare entry in `data/launchers.curation.json` uses an estimated price (about $325k for the first 50 kg, then about $6,500 per kg). Launch Library 2 has no rideshare prices, and every value in the game needs a source.
- **Input:** [APIDoc.md](APIDoc.md) ("The curated list"), `data/launchers.curation.json`.
- **Do:**
  - Find a published rideshare price list from a launch provider (base price, included mass, price per extra kg).
  - Update the `rideshare` entry in `data/launchers.curation.json` with the sourced values, a source URL and the date checked.
  - Re-run `scripts/fetch-launchers.ts` so `data/launchers.json` is regenerated (do not edit it by hand).
  - Update APIDoc.md and tick its open item.
- **Done when:**
  - The rideshare price fields come from a cited, published source, or are clearly marked as an estimate with the reason no source exists.
  - `data/launchers.json` matches the curation file.
  - The 200 kg limit, the 98% success rate and the ~525 km sun-synchronous orbit stay marked as game-design values.

### [ ] T2 – Source a capacity reduction factor for sun-synchronous orbit

- **Owner:** `data-curator`
- **Why:** The launchers only list capacity to low Earth orbit. Wildfire Watch missions will often use a sun-synchronous orbit, where a launcher carries less. [design.md](design.md) section 4.3 calls for a fixed reduction factor.
- **Input:** `data/launchers.json`, [design.md](design.md) section 4.3, [APIDoc.md](APIDoc.md).
- **Do:**
  - Find published low-Earth-orbit and sun-synchronous capacities for at least three of the curated launchers (e.g., from launcher user's guides).
  - Derive one reduction factor (sun-synchronous capacity ÷ low-Earth-orbit capacity), or one per launcher if the values differ a lot.
  - Record the factor(s) with sources in the data files and describe the method in APIDoc.md.
  - Report the result so [design.md](design.md) section 4.3 can replace "to be sourced" with the value.
- **Done when:**
  - The factor is stored in the data with a source URL per launcher used.
  - APIDoc.md explains how it was derived and its open item is ticked.
  - Any launcher without a published sun-synchronous capacity is listed as using the general factor.
