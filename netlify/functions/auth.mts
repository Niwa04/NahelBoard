import type { Config, Context } from "@netlify/functions";
import {
  createSession,
  createUser,
  deleteSession,
  expiredSessionCookie,
  getSessionUser,
  normalizePseudo,
  sessionCookie,
  validatePassword,
  verifyUser,
} from "./_shared/auth.mts";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const action = url.pathname.split("/").pop();

  if (req.method === "GET" && action === "me") {
    const user = await getSessionUser(req);
    return Response.json({ user }, { headers: jsonHeaders });
  }

  if (req.method === "POST" && action === "logout") {
    await deleteSession(req);
    return Response.json(
      { ok: true },
      { headers: { ...jsonHeaders, "Set-Cookie": expiredSessionCookie(req) } },
    );
  }

  if (req.method === "POST" && (action === "signup" || action === "login")) {
    const body = await req.json().catch(() => null);
    const pseudo = normalizePseudo(body?.pseudo);
    const password = validatePassword(body?.password);

    if (pseudo.length < 3) {
      return Response.json({ error: "Le pseudo doit contenir au moins 3 caracteres." }, { status: 400, headers: jsonHeaders });
    }

    if (password.length < 6) {
      return Response.json({ error: "Le mot de passe doit contenir au moins 6 caracteres." }, { status: 400, headers: jsonHeaders });
    }

    try {
      const user = action === "signup"
        ? await createUser(pseudo, password)
        : await verifyUser(pseudo, password);
      const token = await createSession(user);

      return Response.json(
        { user },
        { headers: { ...jsonHeaders, "Set-Cookie": sessionCookie(req, token) } },
      );
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Connexion impossible." }, { status: 400, headers: jsonHeaders });
    }
  }

  return Response.json({ error: "Method not allowed" }, { status: 405, headers: jsonHeaders });
};

export const config: Config = {
  path: ["/api/auth/me", "/api/auth/signup", "/api/auth/login", "/api/auth/logout"],
  method: ["GET", "POST"],
};
