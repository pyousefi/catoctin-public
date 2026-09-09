import { test, expect } from "@playwright/test";
import { build } from "esbuild";

let javascript: string;
let css: string;
test.beforeAll(async () => {
  const result = await build({
    entryPoints: ["tests/browser/fixtures/photo-viewer.tsx"],
    bundle: true,
    write: false,
    outfile: "viewer.js",
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [
      {
        name: "mock-next-navigation",
        setup(builder) {
          builder.onResolve(
            { filter: /^next\/(link|navigation)$/ },
            (args) => ({ path: args.path, namespace: "mock-next" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "mock-next" }, (args) => ({
            contents:
              args.path === "next/link"
                ? 'import React from "react"; export default function Link(props) { return <a {...props} />; }'
                : "export function useRouter() { return { refresh() {} }; }",
            loader: "tsx",
            resolveDir: process.cwd(),
          }));
        },
      },
    ],
  });
  javascript = result.outputFiles.find((file) =>
    file.path.endsWith(".js"),
  )!.text;
  css = result.outputFiles.find((file) => file.path.endsWith(".css"))!.text;
});

test.beforeEach(async ({ page }) => {
  await page.route("**/viewer-fixture?*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/viewer-fixture.css"></head><body><div id="root"></div><script src="/viewer-fixture.js"></script></body></html>',
    }),
  );
  await page.route("**/viewer-fixture.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: javascript }),
  );
  await page.route("**/viewer-fixture.css", (route) =>
    route.fulfill({ contentType: "text/css", body: css }),
  );
  await page.route("**/api/photos/*", (route) =>
    route.fulfill({
      status: route.request().url().endsWith("004") ? 404 : 200,
      contentType: "image/png",
      body: route.request().url().endsWith("004")
        ? Buffer.alloc(0)
        : Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=",
            "base64",
          ),
    }),
  );
});

for (const surface of ["family", "admin"]) {
  test(`${surface} thumbnails open a viewer that navigates without changing selection`, async ({
    page,
  }) => {
    await page.goto(`/viewer-fixture?${surface}`);
    if (surface === "admin")
      await page.getByRole("checkbox", { name: "Select first.png" }).check();
    const opener = page.getByRole("button", {
      name: "Open first.png",
      exact: true,
    });
    await opener.click();
    const viewer = page.getByRole("dialog", { name: "Photo viewer" });
    await expect(viewer).toBeVisible();
    await expect(viewer.getByText("Photo 1 of 4 on this page")).toBeVisible();
    await expect(
      viewer.getByRole("button", { name: "Previous photo" }),
    ).toBeDisabled();
    await expect(viewer.getByRole("img")).toHaveJSProperty("naturalWidth", 1);
    await viewer.getByRole("button", { name: "Next photo" }).click();
    await expect(viewer.getByText("Photo 2 of 4 on this page")).toBeVisible();
    await expect(viewer.getByRole("img")).toHaveAttribute(
      "alt",
      "Camp memory 2",
    );
    await expect(
      viewer.getByRole("link", { name: "Download original second.png" }),
    ).toHaveAttribute(
      "href",
      "/api/photos/00000000-0000-4000-8000-000000000002?download=1",
    );
    await viewer.getByRole("button", { name: "Previous photo" }).click();
    await expect(viewer.getByText("Photo 1 of 4 on this page")).toBeVisible();
    await viewer.getByRole("button", { name: "Close photo viewer" }).click();
    await expect(viewer).not.toBeVisible();
    await expect(opener).toBeFocused();
    if (surface === "admin")
      await expect(
        page.getByRole("checkbox", { name: "Select first.png" }),
      ).toBeChecked();
  });
}

test("keyboard navigation stops at boundaries and Escape restores focus and scrolling", async ({
  page,
}) => {
  await page.goto("/viewer-fixture?family");
  const opener = page.getByRole("button", {
    name: "Open first.png",
    exact: true,
  });
  await opener.click();
  const viewer = page.getByRole("dialog");
  await expect(
    viewer.getByRole("button", { name: "Close photo viewer" }),
  ).toBeFocused();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await page.keyboard.press("ArrowLeft");
  await expect(viewer.getByText("Photo 1 of 4 on this page")).toBeVisible();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await expect(viewer.getByText("Photo 4 of 4 on this page")).toBeVisible();
  await expect(
    viewer.getByRole("button", { name: "Next photo" }),
  ).toBeDisabled();
  await page.keyboard.press("ArrowLeft");
  await expect(viewer.getByText("Photo 3 of 4 on this page")).toBeVisible();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() =>
      document.querySelector("dialog")?.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(viewer).not.toBeVisible();
  await expect(opener).toBeFocused();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await opener.click();
  await expect(viewer.getByText("Photo 1 of 4 on this page")).toBeVisible();
});

test("unsupported and failed previews retain original downloads and navigation", async ({
  page,
}) => {
  await page.goto("/viewer-fixture?family");
  await page
    .getByRole("button", { name: "Open original.heic", exact: true })
    .click();
  const viewer = page.getByRole("dialog");
  await expect(viewer.getByRole("status")).toContainText(
    "Download the original to view this photo format.",
  );
  await expect(viewer.getByRole("img")).toHaveCount(0);
  await expect(
    viewer.getByRole("link", { name: "Download original original.heic" }),
  ).toBeVisible();
  await viewer.getByRole("button", { name: "Next photo" }).click();
  await expect(viewer.getByRole("status")).toContainText(
    "This preview could not be loaded.",
  );
  await expect(
    viewer.getByRole("link", { name: "Download original missing.png" }),
  ).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(viewer.getByRole("img")).toHaveJSProperty("naturalWidth", 1);
});

test("single photos disable both directions and mobile swipes follow the roll", async ({
  page,
}) => {
  await page.goto("/viewer-fixture?single");
  await page
    .getByRole("button", { name: "Open first.png", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Previous photo" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next photo" })).toBeDisabled();
  await page.goto("/viewer-fixture?family");
  await page
    .getByRole("button", { name: "Open first.png", exact: true })
    .click();
  const image = page.locator(".viewer-image");
  await image.dispatchEvent("touchstart", {
    touches: [{ identifier: 0, clientX: 250, clientY: 150 }],
  });
  await image.dispatchEvent("touchend", {
    touches: [],
    changedTouches: [{ identifier: 0, clientX: 100, clientY: 160 }],
  });
  await expect(page.getByText("Photo 2 of 4 on this page")).toBeVisible();
  await image.dispatchEvent("touchstart", {
    touches: [{ identifier: 0, clientX: 100, clientY: 150 }],
  });
  await image.dispatchEvent("touchend", {
    touches: [],
    changedTouches: [{ identifier: 0, clientX: 250, clientY: 160 }],
  });
  await expect(page.getByText("Photo 1 of 4 on this page")).toBeVisible();
  await image.dispatchEvent("touchstart", {
    touches: [{ identifier: 0, clientX: 250, clientY: 150 }],
  });
  await image.dispatchEvent("touchend", {
    touches: [],
    changedTouches: [{ identifier: 0, clientX: 100, clientY: 400 }],
  });
  await expect(page.getByText("Photo 1 of 4 on this page")).toBeVisible();
  expect(
    await page
      .locator("dialog")
      .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
  ).toBe(true);
  for (const button of await page
    .getByRole("dialog")
    .getByRole("button")
    .all()) {
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({
    path: `test-results/viewer-${test.info().project.name}.png`,
  });
});
