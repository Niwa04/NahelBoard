import type { Config, Context } from "@netlify/functions";
import { getAppDatabase } from "./_shared/db.mts";
import { getSessionUser } from "./_shared/auth.mts";

const MAX_CHILD_IMAGE_BYTES = 2 * 1024 * 1024;

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export default async (req: Request, _context: Context) => {
  const user = await getSessionUser(req);

  if (!user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: jsonHeaders });
  }

  const url = new URL(req.url);
  const db = getAppDatabase();

  if (url.pathname.endsWith("/image")) {
    if (req.method === "GET") {
      const rows = await db.sql`
        SELECT child_image_data, child_image_content_type
        FROM profiles
        WHERE user_id = ${user.id}
        LIMIT 1
      `;
      const row = rows[0];
      if (!row?.child_image_data) return new Response("Not found", { status: 404 });

      const base64 = String(row.child_image_data).split(",").pop() || "";
      return new Response(Buffer.from(base64, "base64"), {
        headers: {
          "Content-Type": String(row.child_image_content_type || "image/jpeg"),
          "Cache-Control": "private, max-age=60",
        },
      });
    }

    if (req.method === "POST") {
      const contentType = req.headers.get("Content-Type") || "";
      if (!contentType.startsWith("image/")) {
        return Response.json({ error: "Only images are allowed" }, { status: 400, headers: jsonHeaders });
      }

      const bytes = await req.arrayBuffer();
      if (bytes.byteLength > MAX_CHILD_IMAGE_BYTES) {
        return Response.json({ error: "Image must be 2 MB or smaller" }, { status: 413, headers: jsonHeaders });
      }

      const dataUrl = `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;

      const profile = { childImage: `/api/profile/image?v=${Date.now()}` };
      await db.sql`
        INSERT INTO profiles (user_id, child_image_data, child_image_content_type, updated_at)
        VALUES (${user.id}, ${dataUrl}, ${contentType}, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          child_image_data = EXCLUDED.child_image_data,
          child_image_content_type = EXCLUDED.child_image_content_type,
          updated_at = NOW()
      `;
      return Response.json({ profile }, { headers: jsonHeaders });
    }
  }

  if (req.method === "GET") {
    const rows = await db.sql`
      SELECT child_image_data
      FROM profiles
      WHERE user_id = ${user.id}
      LIMIT 1
    `;
    const profile = rows[0]?.child_image_data ? { childImage: `/api/profile/image?v=${Date.now()}` } : {};
    return Response.json({ profile }, { headers: jsonHeaders });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405, headers: jsonHeaders });
};

export const config: Config = {
  path: ["/api/profile", "/api/profile/image"],
  method: ["GET", "POST"],
};
