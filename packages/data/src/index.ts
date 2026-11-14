/**
 * @space-mission/data: the game's reference data, validated with Zod.
 * sim and the web app import from here and never read the JSON files directly.
 */
export { DataQualitySchema, SourceSchema, type DataQuality, type Source } from "./sources.ts";
export { FixedOrbitSchema, LauncherListSchema, LauncherSchema, launchers, type Launcher } from "./launchers.ts";
