import { renderProject } from "@motion/renderer";

export function renderProjectExample(workspaceRoot: string, projectId: string) {
  return renderProject(workspaceRoot, projectId, true);
}
