import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), sameOrigin: vi.fn() }));
vi.mock("@/lib/auth", () => mocks);
import { POST } from "@/app/api/uploads/failure/route";
import { reportUploadFailure } from "@/lib/upload-diagnostics";
import { PhotoReadError } from "@/lib/read-photo";
const input = {
  attemptId: "9e067844-189c-415a-9868-b0de1987cc67",
  phase: "reading",
  bytes: 123,
  code: "photo_unreadable",
};
const request = (body: unknown = input) =>
  new Request("https://camp.example/api/uploads/failure", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ role: "family" });
  mocks.sameOrigin.mockReturnValue(true);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("private upload diagnostics", () => {
  it("logs a bounded category without photo names, contributor names or exception messages", async () => {
    expect((await POST(request())).status).toBe(204);
    expect(console.warn).toHaveBeenCalledWith("Photo upload failed", input);
  });
  it("rejects foreign-origin and signed-out reports", async () => {
    mocks.sameOrigin.mockReturnValue(false);
    expect((await POST(request())).status).toBe(403);
    mocks.sameOrigin.mockReturnValue(true);
    mocks.session.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(console.warn).not.toHaveBeenCalled();
  });
  it.each([
    { ...input, name: "private.jpg" },
    { ...input, code: "arbitrary text" },
    { ...input, bytes: -1 },
    { ...input, readFailures: { stream: "private provider URI" } },
    { ...input, readFailures: { file_reader: "unknown", message: "private" } },
  ])("rejects untrusted diagnostic fields", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(console.warn).not.toHaveBeenCalled();
  });
  it("accepts fixed reader reasons without logging provider messages", async () => {
    const report = {
      ...input,
      readFailures: {
        stream: "not_readable",
        file_reader: "permission_denied",
      },
    };
    expect((await POST(request(report))).status).toBe(204);
    expect(console.warn).toHaveBeenCalledWith("Photo upload failed", report);
  });
  it("includes reader reasons in client reports", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const readFailures = {
      stream: "not_readable",
      file_reader: "unknown",
    } as const;
    await reportUploadFailure(
      input.attemptId,
      "reading",
      input.bytes,
      new PhotoReadError(readFailures),
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      ...input,
      readFailures,
    });
  });
  it("rejects oversized reports", async () => {
    expect(
      (await POST(request({ ...input, extra: "x".repeat(1024) }))).status,
    ).toBe(413);
  });
  it("reports source failure as a category and absorbs offline diagnostic failures", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    await reportUploadFailure(
      input.attemptId,
      "reading",
      123,
      new PhotoReadError(),
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(input);
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      reportUploadFailure(
        input.attemptId,
        "transfer",
        123,
        new TypeError("private raw message"),
      ),
    ).resolves.toBeUndefined();
    expect(JSON.parse(fetch.mock.calls[1][1].body).code).toBe(
      "network_or_service",
    );
  });
});
