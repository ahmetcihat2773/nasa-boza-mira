/**
 * Download launch vehicles from Launch Library 2 and build the game's launcher list.
 *
 * Usage (Node 22.6 or newer, no dependencies). Exactly one mode is required:
 *   node --experimental-strip-types scripts/fetch-launchers.ts --offline   no API call: rebuild from the committed files
 *   node --experimental-strip-types scripts/fetch-launchers.ts --live      real API: current data, 15 calls per hour
 *   node --experimental-strip-types scripts/fetch-launchers.ts --dev       development mirror: no rate limit, stale data
 *
 * An API run (--live or --dev) makes two requests and writes two files:
 *   data/launchers.raw.json  every vehicle that has both a low-Earth-orbit capacity
 *                            and a launch cost (the game needs both)
 *   data/launchers.json      the vehicles the game uses: those picked in
 *                            data/launchers.curation.json, plus its manual entries
 *
 * An --offline run reads data/launchers.raw.json as it is and only rewrites
 * data/launchers.json. Use it after every edit of data/launchers.curation.json,
 * so the Launch Library 2 values stay as they were when they were fetched.
 *
 * To change which rockets are in the game, edit data/launchers.curation.json.
 * Data: Launch Library 2 by The Space Devs (https://thespacedevs.com/llapi).
 *
 * Launch Library 2 has no capacity to sun-synchronous orbit. A picked vehicle
 * gets its ssoCapacityKg from the published figure typed into the curation file
 * where we have one, otherwise from leoCapacityKg times the general factor in
 * the curation file, marked as an estimate. A manual entry must carry its own.
 * The script stops, and leaves launchers.json untouched, if any vehicle ends up
 * without a valid, sourced ssoCapacityKg.
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
const MODES = ["--offline", "--live", "--dev"];

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

/** Where a value comes from, for the values that are not from Launch Library 2. */
type SourceNote = {
  fields: string[];
  data_quality: "published" | "estimated" | "game-design";
  source: string;
  url?: string;
  checked?: string;
  note?: string;
};

type Launcher = {
  id: number | string;
  name: string;
  manufacturer: string | null;
  leoCapacityKg: number;
  ssoCapacityKg?: number;
  sources?: SourceNote[];
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
  ssoCapacity: { generalFactor: number };
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

/** A picked vehicle with no sun-synchronous capacity in the curation file gets an estimate from its low-Earth-orbit capacity. */
function withSsoCapacity(launcher: Launcher, factor: number): Launcher {
  if (launcher.ssoCapacityKg !== undefined) return launcher;
  const estimate: SourceNote = {
    fields: ["ssoCapacityKg"],
    data_quality: "estimated",
    source: `leoCapacityKg × ${factor}, the general factor in launchers.curation.json`,
  };
  return {
    ...launcher,
    ssoCapacityKg: Math.round(launcher.leoCapacityKg * factor),
    sources: [...(launcher.sources ?? []), estimate],
  };
}

/** Stop before anything is written if a vehicle is listed twice or lacks a valid, sourced capacity to sun-synchronous orbit. */
function check(game: Launcher[]): void {
  const problems: string[] = [];
  const seen = new Set<number | string>();
  for (const r of game) {
    if (seen.has(r.id)) problems.push(`${r.name}: id ${r.id} is listed twice`);
    seen.add(r.id);
    const sso = r.ssoCapacityKg;
    if (typeof sso !== "number" || !Number.isInteger(sso) || sso <= 0 || sso > r.leoCapacityKg) {
      problems.push(`${r.name}: ssoCapacityKg must be a whole number above 0 and at most leoCapacityKg (${r.leoCapacityKg})`);
    }
    const noted = (r.sources ?? []).filter((s) => s.fields?.includes("ssoCapacityKg")).length;
    if (noted !== 1) problems.push(`${r.name}: needs exactly one sources entry that lists ssoCapacityKg, found ${noted}`);
  }
  if (problems.length) throw new Error(`${problems.join("\n")}\nlaunchers.json not updated`);
}

/** Keep the picked vehicles, apply their overrides, fill in sun-synchronous capacity, and add the manual entries. */
function curate(records: Launcher[]): Launcher[] {
  const curation = JSON.parse(readFileSync(CURATION, "utf8")) as Curation;
  const factor = curation.ssoCapacity?.generalFactor;
  if (typeof factor !== "number" || !(factor > 0 && factor <= 1)) {
    throw new Error("ssoCapacity.generalFactor in launchers.curation.json must be a number above 0 and at most 1; launchers.json not updated");
  }
  const byId = new Map(records.map((r) => [r.id, r]));
  const missing = curation.include.filter((pick) => !byId.has(pick.id)).map((pick) => pick.id);
  if (missing.length) {
    throw new Error(`Picked vehicles missing from the API data (ids ${missing.join(", ")}); launchers.json not updated`);
  }
  const picked = curation.include.map((pick) => withSsoCapacity({ ...byId.get(pick.id)!, ...pick.override }, factor));
  const game = [...curation.manual, ...picked.sort((a, b) => a.leoCapacityKg - b.leoCapacityKg)];
  check(game);
  return game;
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function show(records: Launcher[]): void {
  const row = (cells: (string | number)[]) =>
    String(cells[0]).slice(0, 39).padEnd(40) +
    cells.slice(1).map((c, i) => String(c).padStart(i < 3 ? 8 : 9)).join("");
  console.log(row(["Vehicle", "LEO kg", "SSO kg", "GTO kg", "Cost $M", "Flights", "Success"]));
  for (const r of records) {
    const flights = (r.successfulLaunches ?? 0) + (r.failedLaunches ?? 0);
    const rate = r.successRate === null ? "-" : `${Math.round(r.successRate * 100)}%`;
    const estimated = r.sources?.some((s) => s.data_quality === "estimated" && s.fields.includes("ssoCapacityKg"));
    const sso = `${estimated ? "~" : ""}${r.ssoCapacityKg}`;
    console.log(row([r.name, r.leoCapacityKg, sso, r.gtoCapacityKg ?? "-", (r.launchCostUsd / 1e6).toFixed(2), flights || "-", rate]));
  }
  console.log("SSO kg: capacity to sun-synchronous orbit; ~ marks an estimate from the general factor");
}

const args = process.argv.slice(2);
if (args.length !== 1 || !MODES.includes(args[0])) {
  console.error(
    [
      "Give exactly one mode:",
      "  --offline  no API call: rebuild data/launchers.json from the committed files",
      "  --live     real API: current data, 15 calls per hour",
      "  --dev      development mirror: no rate limit, stale data",
      "Nothing was changed.",
    ].join("\n"),
  );
  process.exit(1);
}
const mode = args[0];

let records: Launcher[];
if (mode === "--offline") {
  records = JSON.parse(readFileSync(RAW, "utf8")) as Launcher[];
  console.log(`Offline: ${records.length} candidates read from ${RAW}; the API was not called`);
} else {
  const source = mode === "--live" ? "live" : "dev";
  const vehicles = await fetchAll(HOSTS[source] + QUERY);
  records = vehicles
    .filter((v) => v.leo_capacity && Number(v.launch_cost))
    .map(toGameRecord)
    .sort((a, b) => a.leoCapacityKg - b.leoCapacityKg || a.name.localeCompare(b.name));
  mkdirSync(DATA, { recursive: true });
  writeJson(RAW, records);
  console.log(`${vehicles.length} active vehicles from the ${source} API, ${records.length} with capacity and cost`);
}

const game = curate(records);
writeJson(OUTPUT, game);

console.log(`\nIn the game (${game.length}), saved to ${OUTPUT}:`);
show(game);
console.log(`\nAll ${records.length} candidates are in ${RAW}`);
