import {
  createHmac,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { env } from "./config";
export type Role = "family" | "admin";
export type Session = { role: Role; expires: number; id: string };
export const COOKIE_NAME = "catoctin_session";
export const SESSION_SECONDS = 60 * 60 * 24 * 7;
function signingKey() {
  const secret = env("SESSION_SECRET");
  if (secret.length < 32)
    throw new Error("SESSION_SECRET must contain at least 32 characters");
  return secret;
}
export function issueSession(role: Role, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({
      role,
      expires: now + SESSION_SECONDS * 1000,
      id: randomUUID(),
    }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", signingKey()).update(payload).digest("base64url")}`;
}
export function verifySession(
  token: string | undefined,
  now = Date.now(),
): Session | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    const expected = createHmac("sha256", signingKey())
      .update(payload)
      .digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (
      !["family", "admin"].includes(data.role) ||
      !Number.isFinite(data.expires) ||
      data.expires <= now ||
      typeof data.id !== "string"
    )
      return null;
    return data;
  } catch {
    return null;
  }
}
export function verifyPassword(password: string, stored: string): boolean {
  const [version, salt, hex, ...rest] = stored.split(":");
  if (
    version !== "scrypt" ||
    !salt ||
    !/^[a-f0-9]{128}$/.test(hex ?? "") ||
    rest.length
  )
    throw new Error("Invalid password hash configuration");
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hex, "hex"));
}
