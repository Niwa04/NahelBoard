import { getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export default async (req: Request, _context: Context) => {
  const user = await getUser();

  if (!user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: jsonHeaders });
  }

  const store = getStore({ name: "boards", consistency: "strong" });
  const key = `users/${user.id}/boards.json`;

  if (req.method === "GET") {
    const data = await store.get(key, { type: "json" });
    return Response.json({ boards: Array.isArray(data) ? data : [] }, { headers: jsonHeaders });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.boards)) {
      return Response.json({ error: "Invalid boards payload" }, { status: 400, headers: jsonHeaders });
    }

    await store.setJSON(key, body.boards);
    return Response.json({ ok: true }, { headers: jsonHeaders });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405, headers: jsonHeaders });
};

export const config: Config = {
  path: "/api/boards",
  method: ["GET", "POST"],
};
