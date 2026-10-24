import { chromium, expect } from "@playwright/test";
import electronPath from "electron";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { startServers, root } from "../../scripts/server";

const projectId = "ai-video-origin-story";
const servers = await startServers(false, 40);
const env: NodeJS.ProcessEnv = {
  ...process.env,
  STUDIO_URL: servers.url,
};
delete env.ELECTRON_RUN_AS_NODE;
let app: ReturnType<typeof spawn> | undefined;
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
let success = false;

try {
  const debugPort = 9321;
  app = spawn(
    electronPath as unknown as string,
    [
      `--user-data-dir=${path.join(tmpdir(), `floxbow-inspection-${randomUUID()}`)}`,
      `--remote-debugging-port=${debugPort}`,
      path.join(root, "apps/desktop/electron/main.cjs"),
    ],
    { cwd: root, env, stdio: "inherit" },
  );
  for (let attempt = 0; attempt < 60 && !browser; attempt += 1) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`, {
        timeout: 1500,
      });
    } catch {
      if (app.exitCode !== null)
        throw new Error(`Electron exited with code ${app.exitCode}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (!browser)
    throw new Error("Electron remote debugging did not become ready");
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  if (!page) throw new Error("Electron opened without a primary page");
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => console.error("Renderer error:", error));
  await page.evaluate(
    (id) => localStorage.setItem("motion-project", id),
    projectId,
  );
  await page.reload();
  const review = page.locator(".timeline-review");
  if (await review.evaluate((element) => (element as HTMLDetailsElement).open))
    await review.locator("summary").click();
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  const playhead = page.getByRole("spinbutton", {
    name: "Playhead frame",
    exact: true,
  });
  await expect(playhead).toBeVisible();
  await playhead.fill("195");
  await expect(playhead).toHaveValue("195");
  const selectedClip = page.locator('[data-clip-id="tutorial-promise"]');
  await selectedClip.focus();
  await selectedClip.press("Enter");
  await expect(selectedClip).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText("AI visual context", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "AI visual context" }).click();
  await page
    .getByLabel("What should change at this moment?")
    .fill(
      "First UI test: identify the tutorial caption and dragons at this moment. Preserve the animation.",
    );
  await page.getByRole("button", { name: "Capture and copy for AI" }).click();
  await expect(
    page.locator(".visual-context-actions [role='status']"),
  ).toContainText("Context saved and copied", { timeout: 20_000 });
  const paths = await page.locator(".visual-context-paths").innerText();
  const screenshotPath = paths.match(/Screenshot:\s*(.+)/)?.[1]?.trim();
  const inspectionPath = paths.match(/Frame map:\s*(.+)/)?.[1]?.trim();
  if (!screenshotPath || !inspectionPath)
    throw new Error(`Context artifact paths were not displayed: ${paths}`);
  const metadata = JSON.parse(await readFile(inspectionPath, "utf8"));
  const png = await readFile(screenshotPath);
  if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
    throw new Error("Saved screenshot is not a PNG");
  if (metadata.frame !== 195 || metadata.timeSeconds !== 6.5)
    throw new Error(`Saved frame context is incorrect: ${metadata.frame}`);
  if (
    !metadata.elements.some(
      (node: { id?: string }) => node.id === "tutorial-sample-caption",
    )
  )
    throw new Error("The tutorial caption was missing from frame inspection");
  const dragonNodes = metadata.elements.filter((node: { id?: string }) =>
    node.id?.startsWith("tutorial-dragon-"),
  );
  if (dragonNodes.length !== 3)
    throw new Error(
      `Expected 3 visible dragon nodes, received ${dragonNodes.length}`,
    );
  const copy = await readFile(
    path.join(path.dirname(inspectionPath), "request.md"),
    "utf8",
  );
  if (!copy.includes("First UI test:") || !copy.includes("Frame: 195 (6.500 s"))
    throw new Error(
      "Copied request artifact is missing the user request or frame",
    );
  console.log(
    JSON.stringify(
      {
        projectId,
        frame: metadata.frame,
        elements: metadata.elements.map(
          (node: { id: string; label: string }) => ({
            id: node.id,
            label: node.label,
          }),
        ),
        screenshotPath,
        inspectionPath,
        requestPath: path.join(path.dirname(inspectionPath), "request.md"),
        screenshotBytes: png.byteLength,
        status:
          "first UI context test passed; editor left open for user inspection",
      },
      null,
      2,
    ),
  );
  success = true;
} finally {
  if (!success) {
    await browser?.close();
    app?.kill();
    await servers.close();
  }
}

if (success) await new Promise<void>(() => {});
