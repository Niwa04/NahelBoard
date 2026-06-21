import type { Config, Context } from "@netlify/functions";
import { getAppDatabase } from "./_shared/db.mts";
import { getSessionUser } from "./_shared/auth.mts";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export default async (req: Request, _context: Context) => {
  const user = await getSessionUser(req);

  if (!user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: jsonHeaders });
  }

  const db = getAppDatabase();

  if (req.method === "GET") {
    const rows = await db.sql`
      SELECT data
      FROM boards
      WHERE user_id = ${user.id}
      ORDER BY sort_order ASC, updated_at DESC
    `;
    return Response.json({ boards: rows.map((row) => row.data) }, { headers: jsonHeaders });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.boards)) {
      return Response.json({ error: "Invalid boards payload" }, { status: 400, headers: jsonHeaders });
    }

    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM boards WHERE user_id = $1", [user.id]);

      for (const [index, board] of body.boards.entries()) {
        await client.query(
          `INSERT INTO boards (id, user_id, title, data, sort_order, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [board.id, user.id, board.title || "Board sans nom", board, index],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return Response.json({ ok: true }, { headers: jsonHeaders });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405, headers: jsonHeaders });
};

export const config: Config = {
  path: "/api/boards",
  method: ["GET", "POST"],
};
