import { test } from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const indexPath = path.join(root, "docs/MODULES.md");
const allowedStatuses = new Set([
  "Implemented",
  "Partial",
  "Experimental",
  "Proposed",
  "Deferred",
  "Retired",
]);

test("module index IDs and implementation statuses are consistent", async () => {
  const index = await readFile(indexPath, "utf8");
  const section = index.match(
    /^## Implemented modules and subsystems\s*$([\s\S]*?)(?=^## |$(?![\s\S]))/m,
  )?.[1];
  assert.ok(section, "module table section exists");

  const rows = section
    .split(/\r?\n/)
    .filter((line) => /^\|/.test(line) && !/^\|\s*-/.test(line))
    .slice(1)
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
  assert.ok(rows.length > 0, "module table has at least one entry");

  const ids = new Set<string>();
  for (const [idCell, , , status, docs] of rows) {
    const id = idCell?.match(/^`([a-z0-9]+(?:-[a-z0-9]+)*)`$/)?.[1];
    assert.ok(id, `invalid stable module ID: ${idCell}`);
    assert.ok(!ids.has(id), `duplicate module ID: ${id}`);
    ids.add(id);
    assert.ok(
      allowedStatuses.has(status),
      `invalid status for ${id}: ${status}`,
    );
    assert.match(
      docs,
      /\[[^\]]+\]\([^)]+\)/,
      `${id} needs a documentation link`,
    );
  }
});

test("entry points and module index link to existing local documentation", async () => {
  const sources = [
    "README.md",
    "AGENTS.md",
    "docs/MODULES.md",
    "docs/AI_WORKFLOW.md",
  ];
  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;

  for (const relativeSource of sources) {
    const source = path.join(root, relativeSource);
    const content = await readFile(source, "utf8");
    for (const [, rawTarget] of content.matchAll(linkPattern)) {
      if (/^(?:https?:|mailto:|\/\/)/i.test(rawTarget)) continue;
      const targetPath = decodeURIComponent(
        rawTarget.split(/[?#]/, 1)[0] ?? "",
      );
      if (!targetPath) continue;
      const resolved = path.resolve(path.dirname(source), targetPath);
      await assert.doesNotReject(
        access(resolved),
        `${relativeSource} links to missing file: ${rawTarget}`,
      );
    }
  }
});
