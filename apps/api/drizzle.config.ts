import { defineConfig } from "drizzle-kit";

// Used only by drizzle-kit to generate SQL migrations from src/db/schema.ts into drizzle/.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
