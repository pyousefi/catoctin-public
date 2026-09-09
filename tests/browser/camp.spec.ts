import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";
function testSession(role: "family" | "admin") {
  const payload = Buffer.from(
    JSON.stringify({
      role,
      id: "9e067844-189c-415a-9868-b0de1987cc67",
      expires: Date.now() + 600000,
    }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", "playwright-only-secret-not-a-deployment-secret").update(payload).digest("base64url")}`;
}
async function signIn(
  context: import("@playwright/test").BrowserContext,
  role: "family" | "admin" = "family",
) {
  await context.addCookies([
    {
      name: "catoctin_session",
      value: testSession(role),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
}
test("signed-out visitors see a usable password gate and no albums", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back, campers." }),
  ).toBeVisible();
  await page
    .getByLabel("Family password", { exact: true })
    .fill("example password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(
    page.getByLabel("Family password", { exact: true }),
  ).toHaveAttribute("type", "text");
  expect(await page.locator('a[href*="photos.app.goo.gl"]').count()).toBe(0);
  expect(
    (
      await request.get("/api/photos/9e067844-189c-415a-9868-b0de1987cc67")
    ).status(),
  ).toBe(401);
  await page.screenshot({
    path: `test-results/login-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("family sees the correct albums and an accessible upload form without horizontal overflow", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Camp ends/ })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "See the 2026 photos" }),
  ).toHaveAttribute("href", "https://photos.app.goo.gl/test2026");
  expect(await page.locator('a[href*="photos.app.goo.gl"]').count()).toBe(5);
  await page.getByLabel("Your name").fill("Grandma");
  await page.locator('input[type="file"]').setInputFiles({
    name: "camp.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([255, 216, 255, 217]),
  });
  await expect(
    page.getByRole("button", { name: "Share 1 photo", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Remove camp.jpg" }).click();
  await expect(
    page.getByRole("button", { name: "Share your photos", exact: true }),
  ).toBeDisabled();
  await page
    .getByText("Do I need a Google account to share here?", { exact: true })
    .click();
  await expect(
    page.getByText(/It won’t use your Google storage/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/home-${test.info().project.name}.png`,
    fullPage: true,
  });
});
for (const role of ["family", "admin"] as const) {
  test(`${role} logout clears the session and returns to sign-in`, async ({
    page,
    context,
  }) => {
    await signIn(context, role);
    await page.goto(role === "admin" ? "/admin" : "/");
    const logout = page.waitForResponse((response) =>
      response.url().endsWith("/api/auth/logout"),
    );

    await page.getByRole("button", { name: "Sign out", exact: true }).click();

    expect((await logout).status()).toBe(303);
    await expect(page).toHaveURL(/\/login$/);
    expect(
      (await context.cookies()).some(
        (cookie) => cookie.name === "catoctin_session",
      ),
    ).toBe(false);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });
}

test("logout rejects foreign and opaque origins without clearing the session", async ({
  context,
}) => {
  await signIn(context);

  for (const origin of ["https://untrusted.example", "null"]) {
    const response = await context.request.post("/api/auth/logout", {
      headers: { origin },
    });

    expect(response.status()).toBe(403);
    expect(
      (await context.cookies()).some(
        (cookie) => cookie.name === "catoctin_session",
      ),
    ).toBe(true);
  }
});

test("family cannot enter the organizer area", async ({ page, context }) => {
  await signIn(context);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?admin=1$/);
  await expect(
    page.getByLabel("Organizer password", { exact: true }),
  ).toBeVisible();
});
test("organizer sees the matching album and an honest storage failure", async ({
  page,
  context,
}) => {
  await signIn(context, "admin");
  await page.goto("/admin?year=2010");
  await expect(
    page.getByRole("link", { name: "Open 2010 Google album" }),
  ).toHaveAttribute("href", "https://photos.app.goo.gl/test2010");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Photo storage is unavailable",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("unsupported files are explained before uploading", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "page.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg/>"),
  });
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "choose a JPG",
  );
});

test("sign-in explains unavailable storage and prevents an unusable login", async ({
  page,
}) => {
  await page.goto("/login");

  await expect(page.getByRole("status")).toContainText(
    "Our camp site is getting ready. Please come back soon.",
  );
  await expect(page.getByRole("button", { name: "Come on in" })).toBeDisabled();
  await expect(
    page.getByLabel("Family password", { exact: true }),
  ).toHaveAttribute("type", "password");
});

test("empty photos are rejected before any upload starts", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/");

  await page.locator('input[type="file"]').setInputFiles({
    name: "empty.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.alloc(0),
  });

  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Download the original to your phone",
  );
  await expect(
    page.getByRole("button", { name: "Share your photos" }),
  ).toBeDisabled();
});

test("an oversized batch keeps fifty photos and explains the limit", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/");

  await page.locator('input[type="file"]').setInputFiles(
    Array.from({ length: 51 }, (_, index) => ({
      name: `camp-${index}.jpg`,
      mimeType: "image/jpeg",
      buffer: Buffer.from([255, 216, 255, 217]),
    })),
  );

  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Please share up to 50 photos at a time.",
  );
  await expect(page.getByRole("button", { name: /^Remove camp-/ })).toHaveCount(
    50,
  );
  await expect(
    page.getByRole("button", { name: "Share 50 photos" }),
  ).toBeEnabled();
});

test("a failed upload can be retried with its chosen year and contributor", async ({
  page,
  context,
}) => {
  const attempts: Array<{ year: number; name: string; contributor: string }> =
    [];
  await page.route("**/api/uploads", async (route) => {
    const body = route.request().postDataJSON();
    attempts.push(JSON.parse(body.payload.clientPayload));
    await route.fulfill({
      status: 400,
      json: { error: "Upload temporarily unavailable. Please retry." },
    });
  });
  await signIn(context);
  await page.goto("/");
  await page.getByLabel("Which camp year?").selectOption("2024");
  await page.getByLabel("Your name").fill("Test camper");
  await page.locator('input[type="file"]').setInputFiles({
    name: "retry.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([255, 216, 255, 217]),
  });

  await page
    .getByRole("button", { name: "Share 1 photo", exact: true })
    .click();
  await page.getByRole("button", { name: "Retry unfinished photos" }).click();

  await expect(
    page.getByRole("button", { name: "Retry unfinished photos" }),
  ).toBeEnabled();
  expect(attempts).toHaveLength(2);
  for (const attempt of attempts) {
    expect(attempt).toMatchObject({
      year: 2024,
      name: "retry.jpg",
      contributor: "Test camper",
    });
  }
});

test("a large photo uses multipart and its failure does not stop the remaining queue", async ({
  page,
  context,
}) => {
  const attempts: Array<{ multipart: boolean; size: number; name: string }> =
    [];
  await page.route("**/api/uploads", async (route) => {
    const body = route.request().postDataJSON();
    attempts.push({
      multipart: body.payload.multipart,
      ...JSON.parse(body.payload.clientPayload),
    });
    await route.fulfill({
      status: 400,
      json: { error: "Test upload unavailable" },
    });
  });
  await signIn(context);
  await page.goto("/");
  await page.getByLabel("Your name").fill("Test camper");
  await expect(page.locator('input[type="file"]')).toHaveAttribute(
    "accept",
    /image\/jpeg/,
  );
  await page.locator('input[type="file"]').setInputFiles([
    {
      name: "large.HEIC",
      mimeType: "image/heic",
      buffer: Buffer.alloc(9 * 1024 * 1024),
    },
    {
      name: "small.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from([255, 216, 255, 217]),
    },
  ]);
  await page
    .getByRole("button", { name: "Share 2 photos", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry unfinished photos" }),
  ).toBeEnabled();
  expect(attempts).toEqual([
    expect.objectContaining({
      multipart: true,
      size: 9 * 1024 * 1024,
      name: "large.HEIC",
    }),
    expect.objectContaining({ multipart: true, size: 4, name: "small.jpg" }),
  ]);
  await expect(page.getByLabel("Selected photos")).toContainText(
    "Keep this page open and retry",
  );
});

test("unreadable phone files reserve no storage and a fresh selection replaces failed handles", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    const original = FileReader.prototype.readAsArrayBuffer;
    let fail = true;
    FileReader.prototype.readAsArrayBuffer = function (blob: Blob) {
      if (fail) {
        queueMicrotask(() => this.dispatchEvent(new ProgressEvent("error")));
      } else original.call(this, blob);
    };
    Object.assign(window, {
      allowPhotoReads: () => {
        fail = false;
      },
    });
  });
  const attempts: string[] = [];
  const reports: Array<{ code: string; phase: string }> = [];
  await page.route("**/api/uploads", async (route) => {
    attempts.push(
      JSON.parse(route.request().postDataJSON().payload.clientPayload).name,
    );
    await route.fulfill({
      status: 400,
      json: { error: "Synthetic transfer failure" },
    });
  });
  await page.route("**/api/uploads/failure", async (route) => {
    reports.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });
  await signIn(context);
  await page.goto("/");
  await page.getByLabel("Your name").fill("Test camper");
  const files = ["first.jpg", "second.jpg"].map((name) => ({
    name,
    mimeType: "image/jpeg",
    buffer: Buffer.from([255, 216, 255, 217]),
  }));
  await page.locator('input[type="file"]').setInputFiles(files);
  await page
    .getByRole("button", { name: "Share 2 photos", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry unfinished photos" }),
  ).toBeEnabled();
  await expect(
    page.getByText(/Your phone couldn’t read this photo/),
  ).toHaveCount(2);
  expect(attempts).toEqual([]);
  await expect.poll(() => reports.length).toBe(1);
  expect(reports[0]).toMatchObject({
    phase: "reading",
    code: "photo_unreadable",
  });
  expect(
    await page
      .locator('input[type="file"]')
      .evaluate((input: HTMLInputElement) => input.files?.length),
  ).toBe(2);
  await page.evaluate(() =>
    (window as unknown as { allowPhotoReads: () => void }).allowPhotoReads(),
  );
  await page.locator('input[type="file"]').setInputFiles(files);
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(2);
  await page
    .getByRole("button", { name: "Share 2 photos", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry unfinished photos" }),
  ).toBeEnabled();
  expect(attempts).toEqual(["first.jpg", "second.jpg"]);
});
