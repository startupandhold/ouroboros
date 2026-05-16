import { loadEnvConfig } from "@next/env";

/** Load `.env` / `.env.local` when running outside `next dev` (e.g. sync scripts). */
export function loadProjectEnv(): void {
  loadEnvConfig(process.cwd());
}
