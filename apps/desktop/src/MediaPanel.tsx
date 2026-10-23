import { useCallback, useEffect, useState } from "react";
import { useWorkspaceManager } from "./WorkspaceManager";

type MediaAssetView = {
  id: string;
  type: "audio" | "image";
  displayName: string;
  status: "ready" | "missing" | "invalid";
  message?: string;
};
type MediaSnapshot = { revision: string; assets: MediaAssetView[] };

export function MediaPanel({
  projectId,
  built,
  active = true,
}: {
  projectId: string;
  built: boolean;
  active?: boolean;
}) {
  const workspace = useWorkspaceManager();
  const [snapshot, setSnapshot] = useState<MediaSnapshot>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string>();

  const refresh = useCallback(async () => {
    if (!projectId || built) {
      setSnapshot(undefined);
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(
        `/api/media/${encodeURIComponent(projectId)}`,
      );
      if (!response.ok) throw new Error(await response.text());
      const data: MediaSnapshot = await response.json();
      setSnapshot(data);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [projectId, built]);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    setNotice("");
    void refresh();
    const timer = setInterval(() => void refresh(), 1_800);
    return () => clearInterval(timer);
  }, [refresh, active]);

  async function addMedia(type: MediaAssetView["type"]) {
    if (!snapshot || adding || removing || built) return;
    setAdding(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch(
        `/api/media/${encodeURIComponent(projectId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: snapshot.revision, type }),
        },
      );
      if (response.status === 204) return;
      if (!response.ok) throw new Error(await response.text());
      await refresh();
      setNotice(
        `${type === "audio" ? "Audio" : "PNG image"} linked to this project. The original file stays in place.`,
      );
    } catch (cause) {
      await refresh();
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAdding(false);
    }
  }

  function addImageToTimeline(asset: MediaAssetView) {
    window.dispatchEvent(
      new CustomEvent("motion-add-image", {
        detail: {
          projectId,
          assetId: asset.id,
          displayName: asset.displayName,
        },
      }),
    );
    workspace.activatePanel("editor");
  }

  async function removeAsset(asset: MediaAssetView) {
    if (!snapshot || adding || removing || built) return;
    const confirmed = window.confirm(
      `Remove "${asset.displayName}" from this project? The original file will NOT be deleted.`,
    );
    if (!confirmed) return;

    setRemoving(asset.id);
    setNotice("");
    setError("");
    try {
      const response = await fetch(
        `/api/media/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset.id)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: snapshot.revision }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      await refresh();
      setNotice(
        `${asset.displayName} was removed from this project. The original file was not deleted.`,
      );
    } catch (cause) {
      await refresh();
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRemoving(undefined);
    }
  }

  async function useAsSoundtrack(asset: MediaAssetView) {
    setNotice("");
    setError("");
    try {
      const response = await fetch(
        `/api/media/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset.id)}/soundtrack`,
      );
      const raw = await response.text();
      let data: {
        message?: string;
        durationInSeconds?: number;
        displayName?: string;
      };
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(raw || "The audio file could not be read.");
      }
      if (!response.ok)
        throw new Error(data.message ?? "The audio file could not be read.");
      window.dispatchEvent(
        new CustomEvent("motion-use-soundtrack", {
          detail: {
            projectId,
            assetId: asset.id,
            durationInSeconds: data.durationInSeconds,
            displayName: data.displayName,
          },
        }),
      );
      workspace.activatePanel("editor");
      setNotice(
        `${data.displayName} selected as the project soundtrack. Save the project to keep it.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <section className="media-panel" aria-label="Project media">
      <header className="media-panel-header">
        <div>
          <span className="eyebrow">PROJECT MEDIA</span>
          <h2>Media Library</h2>
          <p className="muted">
            Audio and PNG files are referenced in this project. FloxBow does not
            copy or move them.
          </p>
        </div>
        <div className="media-panel-actions">
          <button
            type="button"
            disabled={
              !projectId ||
              built ||
              loading ||
              adding ||
              Boolean(removing) ||
              !snapshot
            }
            onClick={() => void addMedia("audio")}
          >
            {adding ? "Choosing file…" : "Add Audio"}
          </button>
          <button
            type="button"
            disabled={
              !projectId ||
              built ||
              loading ||
              adding ||
              Boolean(removing) ||
              !snapshot
            }
            onClick={() => void addMedia("image")}
          >
            {adding ? "Choosing file…" : "Add PNG"}
          </button>
        </div>
      </header>

      {built && (
        <p className="media-notice">
          Media registration is available in the live development workspace.
        </p>
      )}
      {!projectId && !built && (
        <p className="media-notice">
          Select or create a project to register audio.
        </p>
      )}
      {loading && <p className="muted">Loading project media…</p>}
      {error && (
        <p className="media-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="media-notice" role="status">
          {notice}
        </p>
      )}

      {!loading && snapshot && snapshot.assets.length === 0 && (
        <div className="media-empty">
          <span aria-hidden="true">♫</span>
          <p>No media is registered for this project yet.</p>
        </div>
      )}

      {snapshot && snapshot.assets.length > 0 && (
        <ul className="media-assets">
          {snapshot.assets.map((asset) => (
            <li className={`media-asset media-${asset.status}`} key={asset.id}>
              <span className="media-asset-icon" aria-hidden="true">
                {asset.type === "audio" ? "♫" : "▧"}
              </span>
              <span className="media-asset-name">
                <strong>{asset.displayName}</strong>
                <small>
                  {asset.type.toUpperCase()} · {asset.id}
                </small>
              </span>
              <span className={`media-asset-status ${asset.status}`}>
                {asset.status === "ready"
                  ? "Available"
                  : asset.status === "missing"
                    ? "Missing file"
                    : "Invalid source"}
              </span>
              {asset.type === "image" && asset.status === "ready" && (
                <button
                  type="button"
                  onClick={() => addImageToTimeline(asset)}
                  aria-label={`Add ${asset.displayName} to Timeline`}
                >
                  Add to Timeline
                </button>
              )}
              {asset.status !== "ready" && (
                <span className="media-asset-warning" role="alert">
                  {asset.status === "missing"
                    ? "The original file cannot be found. The registry entry is preserved."
                    : asset.message}
                </span>
              )}
              <button
                className="media-remove"
                type="button"
                disabled={adding || Boolean(removing) || built}
                onClick={() => void removeAsset(asset)}
              >
                {removing === asset.id ? "Removing…" : "Remove from Project"}
              </button>
              {asset.type === "audio" && (
                <button
                  type="button"
                  disabled={asset.status !== "ready" || built}
                  onClick={() => void useAsSoundtrack(asset)}
                >
                  Use as soundtrack
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
