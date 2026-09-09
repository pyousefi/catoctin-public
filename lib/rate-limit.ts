import { createHmac } from "node:crypto";
import { db } from "./db";
import { env } from "./config";
export async function allowAttempt(request: Request): Promise<boolean> {
  const ip = process.env.VERCEL
    ? (request.headers.get("x-vercel-forwarded-for") ?? "unknown")
    : "local";
  const key = createHmac("sha256", env("SESSION_SECRET"))
    .update(ip)
    .digest("hex");
  const sql = db();
  const rows =
    await sql`INSERT INTO rate_limits(key, attempts, expires_at) VALUES (${key}, 1, now() + interval '15 minutes')
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE WHEN rate_limits.expires_at < now() THEN 1 ELSE rate_limits.attempts + 1 END,
      expires_at = CASE WHEN rate_limits.expires_at < now() THEN now() + interval '15 minutes' ELSE rate_limits.expires_at END
    RETURNING attempts`;
  return Number(rows[0].attempts) <= 15;
}
