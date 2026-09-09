import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  sql: vi.fn(),
  get: vi.fn(),
  head: vi.fn(),
  allowAttempt: vi.fn(),
  configured: vi.fn(),
  verifyPassword: vi.fn(),
  issueSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  session: mocks.session,
  sameOrigin: (request: Request) =>
    request.headers.get("origin") === new URL(request.url).origin,
}));
vi.mock("@/lib/db", () => ({ db: () => mocks.sql }));
vi.mock("@vercel/blob", () => ({ get: mocks.get, head: mocks.head }));
vi.mock("@/lib/rate-limit", () => ({ allowAttempt: mocks.allowAttempt }));
vi.mock("@/lib/config", () => ({
  configured: mocks.configured,
  env: () => "test-hash",
}));
vi.mock("@/lib/session", () => ({
  COOKIE_NAME: "catoctin_session",
  SESSION_SECONDS: 604800,
  verifyPassword: mocks.verifyPassword,
  issueSession: mocks.issueSession,
}));
import { GET } from "@/app/api/photos/[id]/route";
import { PATCH } from "@/app/api/admin/photos/[id]/route";
import { POST as login } from "@/app/api/auth/login/route";
import { completeUpload } from "@/lib/complete-upload";
const id = "9e067844-189c-415a-9868-b0de1987cc67";
const params = { params: Promise.resolve({ id }) };
const request = (path: string, body?: unknown, origin = "http://localhost") =>
  new Request(`http://localhost${path}`, {
    method: body ? "POST" : "GET",
    headers: { origin, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.configured.mockReturnValue(true);
});
describe("private photos and admin controls", () => {
  it("rejects signed-out access before accessing storage", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(request(`/api/photos/${id}`), params)).status).toBe(401);
    expect(mocks.sql).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("does not let family members mark photos as transferred", async () => {
    mocks.session.mockResolvedValue({ role: "family" });
    expect(
      (
        await PATCH(
          request(`/api/admin/photos/${id}`, { transferred: true }),
          params,
        )
      ).status,
    ).toBe(403);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("rejects cross-site admin writes", async () => {
    mocks.session.mockResolvedValue({ role: "admin" });
    expect(
      (
        await PATCH(
          request(
            `/api/admin/photos/${id}`,
            { hidden: true },
            "https://evil.example",
          ),
          params,
        )
      ).status,
    ).toBe(403);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("streams the unchanged original and prevents shared caching", async () => {
    mocks.session.mockResolvedValue({ role: "family" });
    mocks.sql.mockResolvedValue([
      {
        name: "Original.JPG",
        pathname: "photos/2026/test.jpg",
        content_type: "image/jpeg",
      },
    ]);
    const bytes = new Uint8Array([0xff, 0xd8, 3, 4, 5, 0xff, 0xd9]);
    mocks.get.mockResolvedValue({
      statusCode: 200,
      blob: { size: bytes.length },
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
    });
    const response = await GET(request(`/api/photos/${id}?download=1`), params);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(mocks.get).toHaveBeenCalledWith("photos/2026/test.jpg", {
      access: "private",
      useCache: false,
    });
  });
  it("only marks a real, matching upload ready", async () => {
    mocks.sql.mockResolvedValueOnce([
      {
        id,
        status: "pending",
        pathname: "photos/2026/test.jpg",
        size: 12,
        content_type: "image/jpeg",
      },
    ]);
    mocks.head.mockResolvedValue({ size: 11, contentType: "image/jpeg" });
    await expect(completeUpload(id)).rejects.toThrow("does not match");
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
  it("makes completion idempotent", async () => {
    mocks.sql.mockResolvedValue([{ id, status: "ready" }]);
    expect(await completeUpload(id)).toBe(true);
    expect(mocks.head).not.toHaveBeenCalled();
  });
});
describe("password sign-in", () => {
  it("fails closed until deployment is configured", async () => {
    mocks.configured.mockReturnValue(false);
    expect(
      (
        await login(
          request("/api/auth/login", { password: "test", role: "family" }),
        )
      ).status,
    ).toBe(503);
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });
  it("enforces the durable attempt limit", async () => {
    mocks.allowAttempt.mockResolvedValue(false);
    const response = await login(
      request("/api/auth/login", { password: "wrong", role: "admin" }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("900");
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });
  it("does not create a session for a wrong password", async () => {
    mocks.allowAttempt.mockResolvedValue(true);
    mocks.verifyPassword.mockReturnValue(false);
    expect(
      (
        await login(
          request("/api/auth/login", { password: "wrong", role: "family" }),
        )
      ).status,
    ).toBe(401);
    expect(mocks.issueSession).not.toHaveBeenCalled();
  });
  it("sets an HTTP-only SameSite cookie on successful login", async () => {
    mocks.allowAttempt.mockResolvedValue(true);
    mocks.verifyPassword.mockReturnValue(true);
    mocks.issueSession.mockReturnValue("signed-token");
    const response = await login(
      request("/api/auth/login", { password: "correct", role: "family" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(mocks.issueSession).toHaveBeenCalledWith("family");
  });
});
