import { chromium, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9321");
try {
  const page = browser.contexts()[0].pages()[0];
  if (!page) throw new Error("No live editor page is open");
  const review = page.locator(".timeline-review");
  if (await review.evaluate((element) => (element as HTMLDetailsElement).open))
    await review.locator("summary").click();
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.waitForFunction(() => {
    const rect = document
      .querySelector(".canvas-surface")
      ?.getBoundingClientRect();
    return Boolean(rect && rect.width > 300 && rect.height > 200);
  });
  await page.getByRole("button", { name: "Capture and copy for AI" }).click();
  await expect(
    page.locator(".visual-context-actions [role='status']"),
  ).toContainText("Context saved and copied", { timeout: 20_000 });
  const paths = await page.locator(".visual-context-paths").innerText();
  const screenshotPath = paths.match(/Screenshot:\s*(.+)/)?.[1]?.trim();
  const inspectionPath = paths.match(/Frame map:\s*(.+)/)?.[1]?.trim();
  if (!screenshotPath || !inspectionPath)
    throw new Error(`Artifact paths missing from UI: ${paths}`);
  const png = await readFile(screenshotPath);
  const inspection = JSON.parse(await readFile(inspectionPath, "utf8"));
  await writeFile(
    "research/visual-scene-inspection/live-editor-test.png",
    await page.screenshot(),
  );
  console.log(
    JSON.stringify(
      {
        frame: inspection.frame,
        timeSeconds: inspection.timeSeconds,
        canvasCapture: {
          width: png.readUInt32BE(16),
          height: png.readUInt32BE(20),
          bytes: png.byteLength,
        },
        elements: inspection.elements.map(
          (element: { id: string }) => element.id,
        ),
        screenshotPath,
        inspectionPath,
        uiStatus: await page
          .locator(".visual-context-actions [role='status']")
          .innerText(),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
