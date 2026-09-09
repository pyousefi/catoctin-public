import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifySession, type Role } from "./session";
export async function session() {
  return verifySession((await cookies()).get(COOKIE_NAME)?.value);
}
export async function requirePageSession(role?: Role) {
  const current = await session();
  if (!current) redirect(role === "admin" ? "/login?admin=1" : "/login");
  if (role === "admin" && current.role !== "admin") redirect("/login?admin=1");
  return current;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}
