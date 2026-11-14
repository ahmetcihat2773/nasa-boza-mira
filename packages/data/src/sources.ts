import { z } from "zod";

/**
 * How a value was obtained. The launcher data uses three values so far (APIDoc.md, "Fields we add"):
 * - `published`: stated by the provider or agency in its own document; we copied the figure.
 * - `estimated`: derived by us from other figures.
 * - `game-design`: chosen by us for the game; not a real-world figure.
 * Add a value here (and to APIDoc.md) before a data file uses it.
 */
export const DataQualitySchema = z.enum(["published", "estimated", "game-design"]);
export type DataQuality = z.infer<typeof DataQualitySchema>;

/**
 * One `sources` entry: where the listed `fields` of a record come from.
 * Shared by every data file (launchers now; parts and instruments later).
 * `data_quality` keeps the snake_case name used in tech.md and the agent rules.
 */
export const SourceSchema = z.strictObject({
  fields: z.array(z.string().min(1)).min(1),
  data_quality: DataQualitySchema,
  source: z.string().min(1),
  url: z.url().optional(),
  checked: z.iso.date().optional(),
  note: z.string().min(1).optional(),
});
export type Source = z.infer<typeof SourceSchema>;
