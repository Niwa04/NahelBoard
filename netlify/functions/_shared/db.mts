import { getDatabase } from "@netlify/database";

type NetlifyGlobal = typeof globalThis & {
  Netlify?: {
    env?: {
      get?: (key: string) => string | undefined;
    };
  };
};

export function getAppDatabase() {
  const netlifyGlobal = globalThis as NetlifyGlobal;
  const connectionString =
    netlifyGlobal.Netlify?.env?.get?.("NETLIFY_DATABASE_URL") ||
    netlifyGlobal.Netlify?.env?.get?.("DATABASE_URL") ||
    process.env.NETLIFY_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "";

  return connectionString ? getDatabase({ connectionString }) : getDatabase();
}
