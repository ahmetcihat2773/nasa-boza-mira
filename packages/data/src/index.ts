/**
 * @space-mission/data: the game's reference data, validated with Zod.
 * sim and the web app import from here and never read the JSON files directly.
 */
export { DataQualitySchema, SourceSchema, type DataQuality, type Source } from "./sources.ts";
export { FixedOrbitSchema, LauncherListSchema, LauncherSchema, launchers, type Launcher } from "./launchers.ts";
export {
  CostMethodSchema,
  PartRoleSchema,
  PartSchema,
  PartsFileSchema,
  PerformanceSchema,
  SpacecraftSizeSchema,
  SubsystemSchema,
  TierSchema,
  parts,
  partsCostMethod,
  type CostMethod,
  type Part,
  type SpacecraftSize,
  type Subsystem,
  type Tier,
} from "./parts.ts";
export {
  DetectionSchema,
  InstrumentCostMethodSchema,
  InstrumentKindSchema,
  InstrumentSchema,
  InstrumentsFileSchema,
  ScienceValueSchema,
  instruments,
  instrumentsCostMethod,
  type Detection,
  type Instrument,
  type InstrumentCostMethod,
  type InstrumentKind,
} from "./instruments.ts";
