import { getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";

const MAX_CHILD_IMAGE_BYTES = 2 * 1024 * 1024;

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export default async (req: Request, _context: Context) => {
  const user = await getUser();

  if (!user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: jsonHeaders });
  }

  const url = new URL(req.url);
  const store = getStore({ name: "profiles", consistency: "strong" });
  const profileKey = `users/${user.id}/profile.json`;
  const imageKey = `users/${user.id}/child-image`;

  if (url.pathname.endsWith("/image")) {
    if (req.method === "GET") {
      const [image, metadata] = await Promise.all([
        store.get(imageKey, { type: "arrayBuffer" }),
        store.getMetadata(imageKey),
      ]);
      if (!image) return new Response("Not found", { status: 404 });

      return new Response(image, {
        headers: {
          "Content-Type": String(metadata?.metadata?.contentType || "image/jpeg"),
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

      await store.set(imageKey, bytes, {
        metadata: {
          contentType,
          updatedAt: new Date().toISOString(),
        },
      });

      const profile = { childImage: `/api/profile/image?v=${Date.now()}` };
      await store.setJSON(profileKey, profile);
      return Response.json({ profile }, { headers: jsonHeaders });
    }
  }

  if (req.method === "GET") {
    const profile = (await store.get(profileKey, { type: "json" })) || {};
    return Response.json({ profile }, { headers: jsonHeaders });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405, headers: jsonHeaders });
};

export const config: Config = {
  path: ["/api/profile", "/api/profile/image"],
  method: ["GET", "POST"],
};
