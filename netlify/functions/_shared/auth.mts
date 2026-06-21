import { randomBytes, pbkdf2Sync, timingSafeEqual, createHash } from "node:crypto";
import { getDatabase } from "@netlify/database";

const SESSION_COOKIE = "etat_session";
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 32;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type StoredUser = {
  id: string;
  pseudo: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
};

export type SessionUser = {
  id: string;
  pseudo: string;
};

export function normalizePseudo(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 24);
}

export function validatePassword(value: unknown) {
  return String(value || "");
}

export async function createUser(pseudo: string, password: string) {
  const db = getDatabase();
  const existing = await db.sql`SELECT id FROM users WHERE pseudo = ${pseudo} LIMIT 1`;

  if (existing.length) {
    throw new Error("Ce pseudo existe deja.");
  }

  const salt = randomBytes(16).toString("hex");
  const user: StoredUser = {
    id: createHash("sha256").update(`${pseudo}:${randomBytes(16).toString("hex")}`).digest("hex"),
    pseudo,
    passwordHash: hashPassword(password, salt),
    salt,
    createdAt: new Date().toISOString(),
  };

  await db.sql`
    INSERT INTO users (id, pseudo, password_hash, salt, created_at)
    VALUES (${user.id}, ${user.pseudo}, ${user.passwordHash}, ${user.salt}, ${user.createdAt})
  `;
  return toSessionUser(user);
}

export async function verifyUser(pseudo: string, password: string) {
  const db = getDatabase();
  const rows = await db.sql`
    SELECT id, pseudo, password_hash, salt, created_at
    FROM users
    WHERE pseudo = ${pseudo}
    LIMIT 1
  `;
  const row = rows[0];
  const user = row ? {
    id: row.id,
    pseudo: row.pseudo,
    passwordHash: row.password_hash,
    salt: row.salt,
    createdAt: row.created_at,
  } : null;

  if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
    throw new Error("Pseudo ou mot de passe incorrect.");
  }

  return toSessionUser(user);
}

export async function createSession(user: SessionUser) {
  const token = randomBytes(32).toString("hex");
  const db = getDatabase();
  await db.sql`
    INSERT INTO sessions (token_hash, user_id, created_at)
    VALUES (${sessionKey(token)}, ${user.id}, ${new Date().toISOString()})
  `;
  return token;
}

export async function getSessionUser(req: Request) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;

  const db = getDatabase();
  const rows = await db.sql`
    SELECT users.id, users.pseudo
    FROM sessions
    INNER JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ${sessionKey(token)}
    LIMIT 1
  `;
  return rows[0] ? { id: rows[0].id, pseudo: rows[0].pseudo } : null;
}

export async function deleteSession(req: Request) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return;

  const db = getDatabase();
  await db.sql`DELETE FROM sessions WHERE token_hash = ${sessionKey(token)}`;
}

export function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function expiredSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function hashPassword(password: string, salt: string) {
  return pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, "sha256").toString("hex");
}

function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sessionKey(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function toSessionUser(user: StoredUser): SessionUser {
  return { id: user.id, pseudo: user.pseudo };
}

function readCookie(req: Request, name: string) {
  const cookie = req.headers.get("Cookie") || "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || "";
}
