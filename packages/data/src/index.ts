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
export {
  BonusObjectiveSchema,
  MetricSchema,
  MissionCardSchema,
  MissionCardsFileSchema,
  RequirementCheckSchema,
  RequirementSchema,
  RoleSchema,
  missionCards,
  wildfireWatch,
  type BonusObjective,
  type Metric,
  type MissionCard,
  type Requirement,
  type RequirementCheck,
  type Role,
} from "./missionCards.ts";
export {
  AltitudeOptionSchema,
  GroundStationSchema,
  OrbitTypeIdSchema,
  OrbitTypeSchema,
  OrbitsFileSchema,
  altitudeOptions,
  groundStations,
  maxGroundStations,
  orbitTypes,
  type AltitudeOption,
  type GroundStation,
  type OrbitType,
  type OrbitTypeId,
} from "./orbits.ts";
export {
  EventEffectsSchema,
  EventMarginSchema,
  EventOptionSchema,
  EventPhaseSchema,
  EventsFileSchema,
  GameEventSchema,
  gameEvents,
  type EventEffects,
  type EventMargin,
  type EventOption,
  type EventPhase,
  type GameEvent,
} from "./events.ts";
export { RealMissionSchema, RealMissionsFileSchema, realMissions, type RealMission } from "./missions.ts";
export {
  AdvisorLineSchema,
  AdvisorTriggerSchema,
  GlossaryTermSchema,
  LearningFileSchema,
  TourStepSchema,
  advisorLines,
  glossary,
  tourSteps,
  type AdvisorLine,
  type AdvisorTrigger,
  type GlossaryTerm,
  type TourStep,
} from "./learning.ts";
