/** Runtime settings, read from environment variables with local-only defaults. */
export type Config = { host: string; port: number };

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.API_PORT ?? 8787);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`API_PORT must be a whole number from 1 to 65535, got "${env.API_PORT}"`);
  }
  // Local only (tech.md D1): listen on the loopback interface, never on the network.
  return { host: env.API_HOST ?? "127.0.0.1", port };
}
