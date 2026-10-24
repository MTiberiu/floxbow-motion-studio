import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { startServers, root } from "../../scripts/server";

const projectId = "ai-video-origin-story";
const servers = await startServers(false, 41);
let savedDirectory: string | undefined;
try {
  const png = await readFile(
    path.join(root, "projects", projectId, "assets", "thumbnail-dragon.png"),
  );
  const response = await fetch(
    `${servers.url}api/visual-inspection/${projectId}`,
    {
      method: "POST",
      headers: {
        Origin: new URL(servers.url).origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        request: "Temporary endpoint verification; no project edit requested.",
        frame: 540,
        fps: 30,
        durationInFrames: 3510,
        width: 1920,
        height: 1080,
        revision: "verification-only",
        stateVersion: 1,
        selectedClipId: "tutorial-promise",
        selectedClipLabel: "Tutorial promise",
        dirty: false,
        nodes: [
          {
            id: "test-node",
            bounds: { x: 1, y: 2, width: 3, height: 4 },
          },
        ],
        imageDataUrl: `data:image/png;base64,${png.toString("base64")}`,
      }),
    },
  );
  if (!response.ok)
    throw new Error(`Inspection endpoint returned ${response.status}: ${await response.text()}`);
  const result = (await response.json()) as {
    directory: string;
    screenshot: string;
    inspection: string;
    request: string;
  };
  savedDirectory = result.directory;
  assert.equal(
    path
      .relative(
        path.join(root, "projects", projectId, ".floxbow", "visual-inspection"),
        result.directory,
      )
      .startsWith(".."),
    false,
  );
  assert.deepEqual(await readFile(result.screenshot), png);
  const inspection = JSON.parse(await readFile(result.inspection, "utf8"));
  assert.equal(inspection.frame, 540);
  assert.equal(inspection.timeSeconds, 18);
  assert.equal(inspection.elements[0].id, "test-node");
  assert.match(
    await readFile(result.request, "utf8"),
    /Temporary endpoint verification/,
  );
  console.log(
    "Visual context endpoint saved PNG, inspection JSON and request atomically under the project.",
  );
} finally {
  if (savedDirectory)
    await rm(savedDirectory, { recursive: true, force: true });
  await servers.close();
}
