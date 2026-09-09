import { NextResponse } from "next/server";
import { z } from "zod";
import { sameOrigin } from "@/lib/auth";
import { configured, env } from "@/lib/config";
import { allowAttempt } from "@/lib/rate-limit";
import {
  COOKIE_NAME,
  issueSession,
  SESSION_SECONDS,
  verifyPassword,
} from "@/lib/session";
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "Please sign in from this website." },
      { status: 403 },
    );
  if (!configured())
    return NextResponse.json(
      { error: "The camp site is still being set up. Please try again later." },
      { status: 503 },
    );
  try {
    const input = z
      .object({
        password: z.string().min(1).max(256),
        role: z.enum(["family", "admin"]),
      })
      .safeParse(await request.json());
    if (!input.success)
      return NextResponse.json(
        { error: "Please enter your password." },
        { status: 400 },
      );
    if (!(await allowAttempt(request)))
      return NextResponse.json(
        {
          error:
            "Too many attempts. Please wait 15 minutes before trying again.",
        },
        { status: 429, headers: { "Retry-After": "900" } },
      );
    if (
      !verifyPassword(
        input.data.password,
        env(
          input.data.role === "admin"
            ? "ADMIN_PASSWORD_HASH"
            : "FAMILY_PASSWORD_HASH",
        ),
      )
    ) {
      return NextResponse.json(
        { error: "That password didn’t match. Please check it and try again." },
        { status: 401 },
      );
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(COOKIE_NAME, issueSession(input.data.role), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_SECONDS,
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: "We couldn’t sign you in right now. Please try again shortly." },
      { status: 503 },
    );
  }
}
