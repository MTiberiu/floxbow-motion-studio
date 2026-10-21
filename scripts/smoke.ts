import { _electron as electron, expect } from "@playwright/test";
import electronPath from "electron";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { startServers, root, projectsDir } from "./server";

const built = process.argv.includes("--built");
const id = `golden-starter-${Date.now()}`;
const projectPath = path.join(projectsDir, id);
const servers = await startServers(built, 10);
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key, value]) => value !== undefined && key !== "ELECTRON_RUN_AS_NODE",
  ),
) as Record<string, string>;
env.STUDIO_URL = servers.url;

let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
try {
  app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [path.join(root, "apps/desktop/electron/main.cjs")],
    env,
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20_000);
  await page.evaluate(() => {
    localStorage.removeItem("motion-project");
    for (const key of Object.keys(localStorage))
      if (key.startsWith("motion-draft-v1:")) localStorage.removeItem(key);
  });
  await page.reload();
  await expect(page.getByText("A CLEAN WORKSPACE")).toBeVisible();
  await expect(page.getByText("Create your first video project")).toBeVisible();

  await page.getByRole("button", { name: "Explore capabilities" }).click();
  await expect(page.getByRole("region", { name: "Capabilities explorer" })).toBeVisible();
  await expect(page.locator(".capability-preview")).toBeVisible();
  await page.getByRole("tab", { name: "Developer / AI" }).click();
  await expect(page.getByText("Public API", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Read docs\// }).click();
  await expect(page.getByLabel("Documentation")).toBeVisible();
  await expect(page.locator(".capability-resource pre")).not.toBeEmpty();

  if (built) {
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.getByRole("button", { name: "Create Project" })).toBeDisabled();
    console.log("PASS built: empty starter, capability metadata, real preview and docs.");
  } else {
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page.getByRole("button", { name: "Create Project" }).click();
    await page.getByLabel("Project name").fill(id);
    await page.getByRole("button", { name: "Create project", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Composition" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add subtitle" })).toBeEnabled();
    await page.getByRole("button", { name: "Add subtitle" }).click();
    await expect(page.getByRole("button", { name: /^Clip subtitle-/ })).toBeVisible();
    await page.getByLabel("Text", { exact: true }).fill("Human edited caption");
    const preview = page.frameLocator("iframe");
    await expect(preview.getByText("Human edited caption", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Save project", exact: true }).click();
    await expect(page.getByText("Saved to the project. Renders use these edits.")).toBeVisible();
    const saved = JSON.parse(await readFile(path.join(projectPath, "edit-timeline.json"), "utf8"));
    expect(saved.clips).toHaveLength(1);
    expect(saved.clips[0].content.text).toBe("Human edited caption");
    expect(saved.tracks.map((track: { name: string }) => track.name)).toEqual(["Visuals", "Captions"]);
    console.log("PASS development: clean starter, Explorer, project creation, editable subtitle and disk save.");
  }
} catch (error) {
  if (app) {
    const page = await app.firstWindow().catch(() => undefined);
    if (page) console.error("UI:", await page.locator("body").innerText().catch(() => "unavailable"));
  }
  throw error;
} finally {
  await app?.close().catch(() => undefined);
  await servers.close();
  if (!built) await rm(projectPath, { recursive: true, force: true });
}
