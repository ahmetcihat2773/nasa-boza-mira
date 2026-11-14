/**
 * Download launch vehicles from Launch Library 2 and build the game's launcher list.
 *
 * Usage (Node 22.6 or newer, no dependencies):
 *   node --experimental-strip-types scripts/fetch-launchers.ts          development mirror: no rate limit, stale data
 *   node --experimental-strip-types scripts/fetch-launchers.ts --live   real API: current data, 15 calls per hour
 *
 * One run makes two requests and writes two files:
 *   data/launchers.raw.json  every vehicle that has both a low-Earth-orbit capacity
 *                            and a launch cost (the game needs both)
 *   data/launchers.json      the vehicles the game uses: those picked in
 *                            data/launchers.curation.json, plus its manual entries
 *
 * To change which rockets are in the game, edit data/launchers.curation.json.
 * Data: Launch Library 2 by The Space Devs (https://thespacedevs.com/llapi).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOSTS = { dev: "https://lldev.thespacedevs.com", live: "https://ll.thespacedevs.com" };
const QUERY = "/2.2.0/config/launcher/?mode=detailed&active=true&limit=100&format=json";
const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const RAW = join(DATA, "launchers.raw.json");
const CURATION = join(DATA, "launchers.curation.json");
const OUTPUT = join(DATA, "launchers.json");

/** The fields we read from a Launch Library 2 launcher record. */
type ApiVehicle = {
  id: number;
  full_name: string;
  manufacturer: { name: string } | null;
  leo_capacity: number | null;
  gto_capacity: number | null;
  launch_cost: string | number | null;
  successful_launches: number;
  failed_launches: number;
  reusable: boolean;
  image_url: string | null;
  info_url: string | null;
  wiki_url: string | null;
};

type Launcher = {
  id: number | string;
  name: string;
  manufacturer: string | null;
  leoCapacityKg: number;
  gtoCapacityKg: number | null;
  launchCostUsd: number;
  successfulLaunches: number | null;
  failedLaunches: number | null;
  successRate: number | null;
  reusable: boolean;
  imageUrl: string | null;
  infoUrl: string | null;
  [extra: string]: unknown;
};

type Curation = {
  include: { id: number; why: string; override?: Partial<Launcher> }[];
  manual: Launcher[];
};

async function fetchAll(firstUrl: string): Promise<ApiVehicle[]> {
  const vehicles: ApiVehicle[] = [];
  let url: string | null = firstUrl;
  while (url) {
    const response = await fetch(url, { headers: { "User-Agent": "launcher-import-script" } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} from ${url}`);
    const page = (await response.json()) as { results: ApiVehicle[]; next: string | null };
    vehicles.push(...page.results);
    url = page.next;
  }
  return vehicles;
}

function toGameRecord(v: ApiVehicle): Launcher {
  const flown = v.successful_launches + v.failed_launches;
  return {
    id: v.id,
    name: v.full_name,
    manufacturer: v.manufacturer?.name ?? null,
    leoCapacityKg: v.leo_capacity as number,
    gtoCapacityKg: v.gto_capacity || null,
    launchCostUsd: Math.trunc(Number(v.launch_cost)),
    successfulLaunches: v.successful_launches,
    failedLaunches: v.failed_launches,
    successRate: flown ? Math.round((v.successful_launches / flown) * 1000) / 1000 : null,
    reusable: v.reusable,
    imageUrl: v.image_url,
    infoUrl: v.info_url || v.wiki_url,
  };
}

/** Keep the picked vehicles, apply their overrides, and add the manual entries. */
function curate(records: Launcher[]): Launcher[] {
  const curation = JSON.parse(readFileSync(CURATION, "utf8")) as Curation;
  const byId = new Map(records.map((r) => [r.id, r]));
  const missing = curation.include.filter((pick) => !byId.has(pick.id)).map((pick) => pick.id);
  if (missing.length) {
    throw new Error(`Picked vehicles missing from the API data (ids ${missing.join(", ")}); launchers.json not updated`);
  }
  const picked = curation.include.map((pick) => ({ ...byId.get(pick.id)!, ...pick.override }));
  return [...curation.manual, ...picked.sort((a, b) => a.leoCapacityKg - b.leoCapacityKg)];
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function show(records: Launcher[]): void {
  const row = (cells: (string | number)[]) =>
    String(cells[0]).slice(0, 39).padEnd(40) +
    cells.slice(1).map((c, i) => String(c).padStart(i < 2 ? 8 : 9)).join("");
  console.log(row(["Vehicle", "LEO kg", "GTO kg", "Cost $M", "Flights", "Success"]));
  for (const r of records) {
    const flights = (r.successfulLaunches ?? 0) + (r.failedLaunches ?? 0);
    const rate = r.successRate === null ? "-" : `${Math.round(r.successRate * 100)}%`;
    console.log(row([r.name, r.leoCapacityKg, r.gtoCapacityKg ?? "-", (r.launchCostUsd / 1e6).toFixed(1), flights || "-", rate]));
  }
}

const source = process.argv.includes("--live") ? "live" : "dev";
const vehicles = await fetchAll(HOSTS[source] + QUERY);
const records = vehicles
  .filter((v) => v.leo_capacity && Number(v.launch_cost))
  .map(toGameRecord)
  .sort((a, b) => a.leoCapacityKg - b.leoCapacityKg || a.name.localeCompare(b.name));

mkdirSync(DATA, { recursive: true });
writeJson(RAW, records);
const game = curate(records);
writeJson(OUTPUT, game);

console.log(`${vehicles.length} active vehicles from the ${source} API, ${records.length} with capacity and cost`);
console.log(`\nIn the game (${game.length}), saved to ${OUTPUT}:`);
show(game);
console.log(`\nAll ${records.length} candidates are in ${RAW}`);
