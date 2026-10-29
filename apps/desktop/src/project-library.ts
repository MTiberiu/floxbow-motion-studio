export type ProjectFolder = {
  id: string;
  name: string;
  parentId: string | null;
};
export type ProjectLibraryPreferences = {
  folders: ProjectFolder[];
  assignments: Record<string, string>;
};

export const PROJECT_LIBRARY_STORAGE_KEY = "motion-project-library-v1";

export function readProjectLibraryPreferences(
  value: string | null,
): ProjectLibraryPreferences {
  if (!value) return { folders: [], assignments: {} };
  try {
    const parsed = JSON.parse(value) as Partial<ProjectLibraryPreferences>;
    const folders = Array.isArray(parsed.folders)
      ? parsed.folders.filter(
          (folder): folder is ProjectFolder =>
            !!folder &&
            typeof folder.id === "string" &&
            typeof folder.name === "string" &&
            (folder.parentId === null || typeof folder.parentId === "string"),
        )
      : [];
    const ids = new Set(folders.map((folder) => folder.id));
    const validFolders = folders.filter(
      (folder) => folder.parentId === null || ids.has(folder.parentId),
    );
    const assignments =
      parsed.assignments && typeof parsed.assignments === "object"
        ? Object.fromEntries(
            Object.entries(parsed.assignments).filter(
              ([, folderId]) =>
                typeof folderId === "string" && ids.has(folderId),
            ),
          )
        : {};
    return { folders: validFolders, assignments };
  } catch {
    return { folders: [], assignments: {} };
  }
}

export function folderDescendantIds(
  folders: ProjectFolder[],
  folderId: string,
): Set<string> {
  const result = new Set([folderId]);
  for (const folder of folders)
    if (folder.parentId === folderId) result.add(folder.id);
  return result;
}

export function projectMatchesSearch(
  name: string,
  id: string,
  query: string,
): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  return (
    !normalized || `${name} ${id}`.toLocaleLowerCase().includes(normalized)
  );
}

export function projectAspectLabel(width: number, height: number): string {
  const ratio = width / height;
  if (Math.abs(ratio - 16 / 9) < 0.015) return "16:9";
  if (Math.abs(ratio - 9 / 16) < 0.015) return "9:16";
  if (Math.abs(ratio - 1) < 0.015) return "1:1";
  if (Math.abs(ratio - 21 / 9) < 0.02) return "21:9";
  return `${width} × ${height}`;
}
