import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { ProjectRecord } from "@motion/project-loader/schema";
import { CANVAS_FORMATS } from "./canvas-formats";
import {
  folderDescendantIds,
  projectAspectLabel,
  projectMatchesSearch,
  PROJECT_LIBRARY_STORAGE_KEY,
  readProjectLibraryPreferences,
} from "./project-library";
import "./project-library.css";

type ProjectLibraryProps = {
  projects: ProjectRecord[];
  loading?: boolean;
  built: boolean;
  onOpen: (projectId: string) => void;
  onCreate: (name: string, width: number, height: number) => Promise<void>;
  onDelete: (projectId: string) => Promise<void>;
};

export function ProjectLibrary({
  projects,
  built,
  loading = false,
  onOpen,
  onCreate,
  onDelete,
}: ProjectLibraryProps) {
  const [preferences, setPreferences] = useState(() =>
    readProjectLibraryPreferences(
      localStorage.getItem(PROJECT_LIBRARY_STORAGE_KEY),
    ),
  );
  const [activeFolder, setActiveFolder] = useState("all");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<"project" | "folder" | null>(null);
  const [projectName, setProjectName] = useState("");
  const [formatId, setFormatId] = useState<string>(CANVAS_FORMATS[0].id);
  const [folderName, setFolderName] = useState("");
  const [parentFolder, setParentFolder] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const projectKey = projects.map((project) => project.id).join("|");
  const format =
    CANVAS_FORMATS.find((item) => item.id === formatId) ?? CANVAS_FORMATS[0];
  const topFolders = preferences.folders.filter(
    (folder) => folder.parentId === null,
  );
  const folderOptions = preferences.folders.map((folder) => ({
    ...folder,
    label: (folder.parentId ? "↳ " : "") + folder.name,
  }));

  useEffect(() => {
    let active = true;
    const load = async () => {
      const entries = await Promise.all(
        projects.map(async (project) => {
          if (!project.manifest?.editTimeline) return [project.id, ""] as const;
          try {
            const response = await fetch(
              `/api/edit/${encodeURIComponent(project.id)}`,
            );
            if (!response.ok) return [project.id, ""] as const;
            const snapshot = (await response.json()) as {
              timeline?: {
                clips?: {
                  componentId?: string;
                  from?: number;
                  content?: Record<string, unknown>;
                }[];
              };
            };
            const firstImage = [...(snapshot.timeline?.clips ?? [])]
              .filter(
                (clip) =>
                  clip.componentId === "image" &&
                  typeof clip.content?.assetId === "string",
              )
              .sort((a, b) => (a.from ?? 0) - (b.from ?? 0))[0];
            const assetId = firstImage?.content?.assetId;
            return [
              project.id,
              typeof assetId === "string"
                ? `/api/media/${encodeURIComponent(project.id)}/assets/${encodeURIComponent(assetId)}/thumbnail`
                : "",
            ] as const;
          } catch {
            return [project.id, ""] as const;
          }
        }),
      );
      if (active)
        setThumbnails(Object.fromEntries(entries.filter((entry) => entry[1])));
    };
    void load();
    return () => {
      active = false;
    };
  }, [projectKey]);

  const visibleProjects = useMemo(() => {
    const folderIds =
      activeFolder === "all" || activeFolder === "uncategorized"
        ? null
        : folderDescendantIds(preferences.folders, activeFolder);
    return projects
      .filter((project) => {
        const name = project.manifest?.name ?? project.id;
        const assignment = preferences.assignments[project.id];
        if (!projectMatchesSearch(name, project.id, query)) return false;
        if (activeFolder === "uncategorized") return !assignment;
        return !folderIds || (!!assignment && folderIds.has(assignment));
      })
      .sort((a, b) =>
        (a.manifest?.name ?? a.id).localeCompare(b.manifest?.name ?? b.id),
      );
  }, [activeFolder, preferences, projects, query]);

  function savePreferences(next: typeof preferences) {
    setPreferences(next);
    localStorage.setItem(PROJECT_LIBRARY_STORAGE_KEY, JSON.stringify(next));
  }
  function folderCount(folderId?: string) {
    return projects.filter((project) => {
      const assigned = preferences.assignments[project.id];
      if (!folderId) return !assigned;
      return (
        !!assigned &&
        folderDescendantIds(preferences.folders, folderId).has(assigned)
      );
    }).length;
  }
  function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = folderName.trim();
    if (!name) {
      setDialogError("Enter a category name.");
      return;
    }
    const id = "folder-" + crypto.randomUUID();
    savePreferences({
      ...preferences,
      folders: [
        ...preferences.folders,
        { id, name, parentId: parentFolder || null },
      ],
    });
    setActiveFolder(id);
    setFolderName("");
    setParentFolder("");
    setDialog(null);
    setDialogError("");
  }
  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (built) return;
    setCreating(true);
    setDialogError("");
    try {
      await onCreate(projectName, format.width, format.height);
      setProjectName("");
      setDialog(null);
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  }
  async function deleteProject() {
    if (!deleteTarget || built) return;
    setDeleting(true);
    setDialogError("");
    try {
      await onDelete(deleteTarget.id);
      const assignments = { ...preferences.assignments };
      delete assignments[deleteTarget.id];
      savePreferences({ ...preferences, assignments });
      setDeleteTarget(null);
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="project-library" aria-label="Project library">
      <header className="project-library-header">
        <div>
          <span className="eyebrow">FLOXBOW · LOCAL WORKSPACE</span>
          <h1>Your projects</h1>
          <p>Open an existing project or start a new one.</p>
        </div>
        <button
          className="project-library-primary"
          disabled={built}
          onClick={() => {
            setDialog("project");
            setDialogError("");
          }}
        >
          ＋ New project
        </button>
      </header>
      <div className="project-library-body">
        <aside
          className="project-library-folders"
          aria-label="Project categories"
        >
          <button
            className={activeFolder === "all" ? "active" : ""}
            onClick={() => setActiveFolder("all")}
          >
            <span>All projects</span>
            <small>{projects.length}</small>
          </button>
          <button
            className={activeFolder === "uncategorized" ? "active" : ""}
            onClick={() => setActiveFolder("uncategorized")}
          >
            <span>Uncategorized</span>
            <small>{folderCount()}</small>
          </button>
          {topFolders.map((folder) => (
            <div className="project-folder-group" key={folder.id}>
              <button
                className={activeFolder === folder.id ? "active" : ""}
                onClick={() => setActiveFolder(folder.id)}
              >
                <span>▰ {folder.name}</span>
                <small>{folderCount(folder.id)}</small>
              </button>
              {preferences.folders
                .filter((child) => child.parentId === folder.id)
                .map((child) => (
                  <button
                    className={
                      "project-subfolder " +
                      (activeFolder === child.id ? "active" : "")
                    }
                    key={child.id}
                    onClick={() => setActiveFolder(child.id)}
                  >
                    <span>↳ {child.name}</span>
                    <small>
                      {
                        projects.filter(
                          (project) =>
                            preferences.assignments[project.id] === child.id,
                        ).length
                      }
                    </small>
                  </button>
                ))}
              <button
                className="project-add-subfolder"
                onClick={() => {
                  setParentFolder(folder.id);
                  setFolderName("");
                  setDialogError("");
                  setDialog("folder");
                }}
              >
                ＋ Subcategory
              </button>
            </div>
          ))}
          <button
            className="project-add-folder"
            onClick={() => {
              setParentFolder("");
              setFolderName("");
              setDialogError("");
              setDialog("folder");
            }}
          >
            ＋ Category
          </button>
        </aside>
        <main className="project-library-main">
          <div className="project-library-tools">
            <label className="project-library-search">
              <span>⌕</span>
              <input
                aria-label="Search projects"
                placeholder="Search by name…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <span>
              {visibleProjects.length}{" "}
              {visibleProjects.length === 1 ? "project" : "projects"}
            </span>
          </div>
          {loading ? (
            <div className="project-library-empty" aria-busy="true">
              <span className="project-library-empty-icon">◈</span>
              <h2>Loading projects…</h2>
            </div>
          ) : visibleProjects.length === 0 ? (
            <div className="project-library-empty">
              <span className="project-library-empty-icon">◈</span>
              <h2>
                {projects.length ? "No projects found" : "Start a new project"}
              </h2>
              <p>
                {projects.length
                  ? "Try another search or category."
                  : "Your projects will appear here as cards."}
              </p>
              {!projects.length && (
                <button
                  className="project-library-primary"
                  disabled={built}
                  onClick={() => setDialog("project")}
                >
                  ＋ Create your first project
                </button>
              )}
            </div>
          ) : (
            <div className="project-card-grid">
              {visibleProjects.map((project) => {
                const manifest = project.manifest;
                const assignedFolder =
                  preferences.assignments[project.id] ?? "";
                return (
                  <article className="project-card" key={project.id}>
                    <button
                      className="project-card-open"
                      onClick={() => onOpen(project.id)}
                    >
                      <span
                        className="project-card-preview"
                        style={{
                          aspectRatio: manifest
                            ? manifest.width + " / " + manifest.height
                            : "16 / 9",
                        }}
                      >
                        {thumbnails[project.id] ? (
                          <img
                            src={thumbnails[project.id]}
                            alt=""
                            loading="lazy"
                            onError={() =>
                              setThumbnails((current) => {
                                const next = { ...current };
                                delete next[project.id];
                                return next;
                              })
                            }
                          />
                        ) : (
                          <span className="project-card-glyph">
                            {manifest?.type === "lyrics" ? "♫" : "✳"}
                          </span>
                        )}
                        <small>
                          {manifest
                            ? projectAspectLabel(
                                manifest.width,
                                manifest.height,
                              )
                            : "Project"}
                        </small>
                      </span>
                      <span className="project-card-title">
                        {manifest?.name ?? project.id}
                      </span>
                      <span className="project-card-meta">
                        {project.error
                          ? "Needs attention"
                          : manifest?.type === "lyrics"
                            ? "Lyrics & music"
                            : "Video project"}{" "}
                        ·{" "}
                        {manifest
                          ? manifest.width + " × " + manifest.height
                          : project.id}
                      </span>
                    </button>
                    <div className="project-card-footer">
                      <label>
                        <span>Category</span>
                        <select
                          aria-label={
                            "Project category for " +
                            (manifest?.name ?? project.id)
                          }
                          value={assignedFolder}
                          onChange={(event) => {
                            const assignments = { ...preferences.assignments };
                            if (event.target.value)
                              assignments[project.id] = event.target.value;
                            else delete assignments[project.id];
                            savePreferences({ ...preferences, assignments });
                          }}
                        >
                          <option value="">Uncategorized</option>
                          {folderOptions.map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button onClick={() => onOpen(project.id)}>Open →</button>
                      <button
                        className="project-card-delete"
                        disabled={built}
                        aria-label={`Delete ${manifest?.name ?? project.id}`}
                        title="Delete project and its files"
                        onClick={() => {
                          setDeleteTarget(project);
                          setDialogError("");
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>
      {deleteTarget && (
        <div className="project-library-backdrop" role="presentation">
          <section
            className="project-library-dialog project-delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="project-delete-title"
          >
            <button
              className="project-library-dialog-close"
              aria-label="Close"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              ×
            </button>
            <span className="eyebrow">DELETE PROJECT</span>
            <h2 id="project-delete-title">
              Delete “{deleteTarget.manifest?.name ?? deleteTarget.id}”?
            </h2>
            <p>
              This permanently deletes the project folder, including its
              Timeline, Storyboard, and local media files.
            </p>
            {dialogError && (
              <p className="project-library-dialog-error" role="alert">
                {dialogError}
              </p>
            )}
            <footer>
              <button disabled={deleting} onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                className="project-delete-confirm"
                disabled={deleting || built}
                onClick={() => void deleteProject()}
              >
                {deleting ? "Deleting…" : "Delete project"}
              </button>
            </footer>
          </section>
        </div>
      )}
      {dialog && (
        <div
          className="project-library-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !creating)
              setDialog(null);
          }}
        >
          <section
            className="project-library-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-library-dialog-title"
          >
            <button
              className="project-library-dialog-close"
              aria-label="Close"
              onClick={() => setDialog(null)}
            >
              ×
            </button>
            <span className="eyebrow">
              {dialog === "project" ? "NEW PROJECT" : "ORGANIZATION"}
            </span>
            <h2 id="project-library-dialog-title">
              {dialog === "project" ? "Create a project" : "Add a category"}
            </h2>
            {dialog === "project" ? (
              <form onSubmit={(event) => void createProject(event)}>
                <label>
                  Project name
                  <input
                    autoFocus
                    maxLength={80}
                    placeholder="For example: Last Tram Home"
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                  />
                </label>
                <label>
                  Video format
                  <select
                    value={formatId}
                    onChange={(event) => setFormatId(event.target.value)}
                  >
                    {CANVAS_FORMATS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label} · {item.width} × {item.height}
                      </option>
                    ))}
                  </select>
                </label>
                <div
                  className="project-format-preview"
                  style={{ aspectRatio: format.width + " / " + format.height }}
                >
                  <span>{format.id}</span>
                </div>
                {dialogError && (
                  <p className="project-library-dialog-error" role="alert">
                    {dialogError}
                  </p>
                )}
                <footer>
                  <button type="button" onClick={() => setDialog(null)}>
                    Cancel
                  </button>
                  <button
                    className="project-library-primary"
                    type="submit"
                    disabled={creating || !projectName.trim()}
                  >
                    {creating ? "Creating…" : "Create project"}
                  </button>
                </footer>
              </form>
            ) : (
              <form onSubmit={createFolder}>
                <label>
                  Category name
                  <input
                    autoFocus
                    maxLength={60}
                    placeholder="For example: Shorts"
                    value={folderName}
                    onChange={(event) => setFolderName(event.target.value)}
                  />
                </label>
                <label>
                  Parent category
                  <select
                    value={parentFolder}
                    onChange={(event) => setParentFolder(event.target.value)}
                  >
                    <option value="">Top-level category</option>
                    {topFolders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                </label>
                {dialogError && (
                  <p className="project-library-dialog-error" role="alert">
                    {dialogError}
                  </p>
                )}
                <footer>
                  <button type="button" onClick={() => setDialog(null)}>
                    Cancel
                  </button>
                  <button className="project-library-primary" type="submit">
                    Save category
                  </button>
                </footer>
              </form>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
