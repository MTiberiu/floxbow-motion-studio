import { discover } from "@motion/project-loader";

export function discoverProjects(projectsDirectory: string) {
  return discover(projectsDirectory);
}
