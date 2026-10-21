import { _electron as electron, expect } from "@playwright/test";
import electronPath from "electron";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { startServers, root, projectsDir } from "./server";

const built = process.argv.includes("--built");
const id = `golden-starter-${Date.now()}`;
const createdIds = [id];
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

    // Scenario B: an external process updates the saved timeline while the editor is clean.
    const editPath = path.join(projectPath, "edit-timeline.json");
    const externalUpdate = structuredClone(saved);
    externalUpdate.clips[0].content.text = "Updated by external agent";
    await writeFile(editPath, `${JSON.stringify(externalUpdate, null, 2)}\n`);
    await expect(preview.getByText("Updated by external agent", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Updated by external agent");

    // Scenario C: preserve both versions when external edits arrive during an unsaved UI draft.
    await page.getByLabel("Text", { exact: true }).fill("Unsaved human draft");
    const concurrentExternal = structuredClone(externalUpdate);
    concurrentExternal.clips[0].content.text = "External version to protect";
    await writeFile(editPath, `${JSON.stringify(concurrentExternal, null, 2)}\n`);
    await expect(page.locator(".timeline-editor .error")).toContainText("project changed on disk while you were editing");
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Unsaved human draft");
    await expect(page.getByRole("button", { name: "Save project", exact: true })).toBeDisabled();
    expect(JSON.parse(await readFile(editPath, "utf8")).clips[0].content.text).toBe("External version to protect");

    await page.getByRole("button", { name: "Reload from disk", exact: true }).click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("External version to protect");
    await expect(preview.getByText("External version to protect", { exact: true })).toBeVisible();

    // Three independent project IDs can be created and switched without sharing editor state.
    const secondId = `${id}-two`;
    const thirdId = `${id}-three`;
    const displayName = (projectId: string) => projectId.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
    async function selectProject(projectId: string) {
      const buttons = page!.locator(".project");
      await expect(buttons).toHaveCount(3);
      const target = displayName(projectId);
      const labels = await buttons.allInnerTexts();
      const index = labels.findIndex((label) => new RegExp(`${target}\\s+Explainer video`).test(label));
      expect(index).toBeGreaterThanOrEqual(0);
      await buttons.nth(index).click();
      await expect(page!.locator(".project.active")).toContainText(target);
    }
    for (const [projectId, caption] of [
      [secondId, "Caption belongs to project two"],
      [thirdId, "Caption belongs to project three"],
    ]) {
      createdIds.push(projectId);
      await page.getByRole("button", { name: "+ Create", exact: true }).click();
      await page.getByLabel("Project name").fill(projectId);
      await page.getByRole("button", { name: "Create project", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Composition" })).toBeVisible();
      await page.getByRole("button", { name: "Add subtitle" }).click();
      await page.getByLabel("Text", { exact: true }).fill(caption);
      await page.getByRole("button", { name: "Save project", exact: true }).click();
      await expect(page.getByText("Saved to the project. Renders use these edits.")).toBeVisible();
      const savedProject = JSON.parse(await readFile(path.join(projectsDir, projectId, "edit-timeline.json"), "utf8"));
      expect(savedProject.clips[0].content.text).toBe(caption);
    }
    await selectProject(id);
    await expect(page.frameLocator("iframe").getByText("External version to protect", { exact: true })).toBeVisible();
    await selectProject(secondId);
    await expect(page.frameLocator("iframe").getByText("Caption belongs to project two", { exact: true })).toBeVisible();
    await selectProject(thirdId);
    await expect(page.frameLocator("iframe").getByText("Caption belongs to project three", { exact: true })).toBeVisible();
    console.log("PASS development: clean starter, Explorer, three isolated projects, project switching, human save, external reload and conflict protection.");
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
  if (!built)
    await Promise.all(createdIds.map((projectId) => rm(path.join(projectsDir, projectId), { recursive: true, force: true })));
}
