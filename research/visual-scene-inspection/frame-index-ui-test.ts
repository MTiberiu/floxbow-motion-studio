import { chromium, expect } from "@playwright/test";
import electronPath from "electron";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { startServers, root } from "../../scripts/server";

const projectId = "ai-video-origin-story";
const servers = await startServers(false, 42);
const env: NodeJS.ProcessEnv = { ...process.env, STUDIO_URL: servers.url };
delete env.ELECTRON_RUN_AS_NODE;
let app: ReturnType<typeof spawn> | undefined;
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
let success = false;

try {
  const debugPort = 9322;
  app = spawn(
    electronPath as unknown as string,
    [
      `--user-data-dir=${path.join(tmpdir(), `floxbow-frame-index-${randomUUID()}`)}`,
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
  await playhead.fill("999");
  await expect(playhead).toHaveValue("999");
  const selectedScene = page.locator('[data-clip-id="scene-03-first-result"]');
  await selectedScene.focus();
  await selectedScene.press("Enter");
  await expect(selectedScene).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "AI visual context" }).click();
  await page
    .getByLabel("What should change at this moment?")
    .fill("Locate the title and report its editable text and color fields.");
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
  if (metadata.schemaVersion !== 2 || metadata.frame !== 999)
    throw new Error("Context package version or captured frame is incorrect");
  const title = metadata.timelineElements.find(
    (item: { clipId?: string }) => item.clipId === "title-tiny-change",
  );
  if (!title) throw new Error("The title clip was not indexed at frame 999");
  const textField = title.editableFields.find(
    (field: { key?: string; target?: string }) =>
      field.key === "text" && field.target === "content",
  );
  const colorField = title.editableFields.find(
    (field: { key?: string; target?: string }) =>
      field.key === "color" && field.target === "props",
  );
  if (textField?.value !== "O mică schimbare")
    throw new Error("The indexed title text field has the wrong value");
  if (colorField?.value !== "#ff364f")
    throw new Error("The indexed title color field has the wrong value");
  if (title.editability !== "declared-fields")
    throw new Error(
      "The title was not marked editable through declared fields",
    );
  const request = await readFile(
    path.join(path.dirname(inspectionPath), "request.md"),
    "utf8",
  );
  if (!request.includes("inspection.json.timelineElements"))
    throw new Error("The AI request does not explain the frame lookup index");
  console.log(
    JSON.stringify(
      {
        projectId,
        frame: metadata.frame,
        title: {
          clipId: title.clipId,
          label: title.label,
          componentId: title.componentId,
          text: textField.value,
          color: colorField.value,
          editableFields: title.editableFields.length,
        },
        screenshotPath,
        inspectionPath,
        status: "frame-index UI test passed; editor left open for review",
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
