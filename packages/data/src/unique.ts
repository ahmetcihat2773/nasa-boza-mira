import type { z } from "zod";

/** superRefine helper: flags any `key` value (default `id`) that appears twice in a list. */
export function uniqueBy<T>(key: keyof T & string = "id" as keyof T & string) {
  return (list: readonly T[], ctx: z.RefinementCtx) => {
    const seen = new Set<unknown>();
    list.forEach((item, i) => {
      const v = item[key];
      if (seen.has(v)) ctx.addIssue({ code: "custom", path: [i, key], message: `${key} ${String(v)} is listed twice` });
      seen.add(v);
    });
  };
}
