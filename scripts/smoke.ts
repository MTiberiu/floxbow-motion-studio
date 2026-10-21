import { _electron as electron } from "@playwright/test";
import electronPath from "electron";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { startServers, root, projectsDir } from "./server";
const built = process.argv.includes("--built");
const servers = await startServers(built, 1000);
const env: Record<string, string> = {};
for (const [k, v] of Object.entries(process.env))
  if (v !== undefined && k !== "ELECTRON_RUN_AS_NODE") env[k] = v;
env.STUDIO_URL = servers.url;
let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
const fixture = path.join(projectsDir, "smoke-fixture");
let fixtureOwned = false;
try {
  app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [path.join(root, "apps/desktop/electron/main.cjs")],
    env,
    timeout: 60000,
  });
  const page = await app.firstWindow();
  page.on("pageerror", (e) => console.error("PAGE ERROR", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.error("CONSOLE", m.text());
  });
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: /First Tutorial/ }).click();
  await page
    .getByRole("heading", { name: "First Tutorial", exact: true })
    .waitFor();
  const frame = page.frameLocator("iframe");
  await frame
    .getByText("Great stories start with an idea.")
    .waitFor({ timeout: 60000 })
    .catch(async (e) => {
      console.error(await page.locator("iframe").getAttribute("src"));
      console.error(await page.frames()[1]?.locator("body").innerText());
      await page.screenshot({ path: path.join(root, "out/smoke-failure.png") });
      throw e;
    });
  assert.equal(
    await page.evaluate(
      () => typeof (window as unknown as { require: unknown }).require,
    ),
    "undefined",
  );
  await mkdir(path.join(root, "out"), { recursive: true });
  await page.screenshot({
    path: path.join(root, "out/studio-smoke.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /GI GO LO/ }).click();
  await frame.getByText(/ILLUSTRATIVE TIMING ONLY/).waitFor();
  await page.getByRole("button", { name: "Lyrics sync", exact: true }).click();
  await page.getByLabel("c1w1 start").waitFor();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  if (built) {
    await frame.getByText(/ILLUSTRATIVE TIMING ONLY/).waitFor();
    await page.reload();
    await page
      .getByRole("heading", { name: "GI GO LO", exact: true })
      .waitFor();
    await page.getByRole("button", { name: /First Tutorial/ }).click();
    console.log(
      "PASS: built Electron previews, switching, lyrics and selection persistence.",
    );
  } else {
    await mkdir(fixture);
    fixtureOwned = true;
    await writeFile(
      path.join(fixture, "Composition.tsx"),
      `export default function Video(){return <h1>Discovered independently</h1>}`,
    );
    await writeFile(
      path.join(fixture, "project.json"),
      JSON.stringify({
        id: "smoke-fixture",
        name: "Smoke Fixture",
        type: "custom",
        width: 1280,
        height: 720,
        fps: 30,
        durationInFrames: 90,
        entry: "Composition.tsx",
        sdkVersion: "0.1.0",
      }),
    );
    await page
      .getByRole("button", { name: /Smoke Fixture/ })
      .click({ timeout: 20000 });
    await frame
      .getByText("Discovered independently")
      .waitFor({ timeout: 30000 });
    await writeFile(
      path.join(fixture, "Composition.tsx"),
      `export default function Video(){return <h1>Live edit applied</h1>}`,
    );
    await frame.getByText("Live edit applied").waitFor({ timeout: 30000 });
    await writeFile(
      path.join(fixture, "Composition.tsx"),
      "export default function Broken( {",
    );
    await frame.getByRole("alert").waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: /First Tutorial/ }).click();
    await frame
      .getByText("Great stories start with an idea.")
      .waitFor({ timeout: 30000 });
    await writeFile(
      path.join(fixture, "Composition.tsx"),
      `export default function Video(){return <h1>Recovered composition</h1>}`,
    );
    await page.getByRole("button", { name: /Smoke Fixture/ }).click();
    await frame.getByText("Recovered composition").waitFor({ timeout: 30000 });
    await writeFile(
      path.join(fixture, "Composition.tsx"),
      `export default function Video(){throw new Error('Intentional runtime failure');return null}`,
    );
    await frame.getByRole("alert").waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: /First Tutorial/ }).click();
    await frame
      .getByText("Great stories start with an idea.")
      .waitFor({ timeout: 30000 });
    console.log(
      "PASS: Electron launch, player, switching, lyrics, discovery, live edit, compile/runtime isolation, recovery, Node disabled.",
    );
  }
} finally {
  await app?.close();
  await servers.close();
  // This fixed test-only folder is created above exclusively; never remove user projects.
  if (
    fixtureOwned &&
    (
      await readFile(path.join(fixture, "project.json"), "utf8").catch(() => "")
    ).includes('"id":"smoke-fixture"')
  )
    await rm(fixture, { recursive: true, force: true });
}
