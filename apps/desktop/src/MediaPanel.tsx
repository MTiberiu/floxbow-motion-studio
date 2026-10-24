import { useCallback, useEffect, useState } from "react";
import { useWorkspaceManager } from "./WorkspaceManager";
import { MEDIA_ASSET_DRAG_TYPE } from "./media-drag";

type MediaAssetView = {
  id: string;
  type: "audio" | "image" | "video";
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
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [imageAspectRatios, setImageAspectRatios] = useState<
    Record<string, number>
  >({});

  useEffect(() => setImageAspectRatios({}), [projectId]);

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
        `${type === "audio" ? "Audio" : type === "image" ? "PNG image" : "MP4 video"} linked to this project. The original file stays in place.`,
      );
    } catch (cause) {
      await refresh();
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAdding(false);
    }
  }

  function addAssetToTimeline(asset: MediaAssetView) {
    window.dispatchEvent(
      new CustomEvent(
        asset.type === "video" ? "motion-add-video" : "motion-add-image",
        {
          detail: {
            projectId,
            assetId: asset.id,
            displayName: asset.displayName,
            aspectRatio: imageAspectRatios[asset.id],
          },
        },
      ),
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

  function beginAssetDrag(
    event: React.DragEvent<HTMLLIElement>,
    asset: MediaAssetView,
  ) {
    if (
      asset.status !== "ready" ||
      asset.type === "audio" ||
      !projectId ||
      built
    ) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData(
      MEDIA_ASSET_DRAG_TYPE,
      JSON.stringify({
        projectId,
        assetId: asset.id,
        type: asset.type,
        displayName: asset.displayName,
        aspectRatio: imageAspectRatios[asset.id],
      }),
    );
    event.dataTransfer.effectAllowed = "copy";
  }

  return (
    <section
      className="media-panel media-panel-sidebar"
      aria-label="Project media"
    >
      <header className="media-panel-header">
        <div>
          <span className="eyebrow">PROJECT ASSETS</span>
          <h3>Media Library</h3>
          <p className="muted">Linked files stay at their original location.</p>
        </div>
        <div className="media-panel-actions">
          <button
            type="button"
            disabled={!projectId || built}
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("motion-open-asset-organizer", {
                  detail: { projectId },
                }),
              )
            }
          >
            Organize
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
            onClick={() => void addMedia("video")}
          >
            {adding ? "Choosing file…" : "Add Video"}
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
          {snapshot.assets.map((asset) => {
            const thumbnailUrl = `/api/media/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset.id)}/thumbnail`;
            return (
              <li
                className={`media-asset media-${asset.status}${selectedAssetId === asset.id ? " is-selected" : ""}`}
                key={asset.id}
                draggable={
                  asset.status === "ready" && asset.type !== "audio" && !built
                }
                onDragStart={(event) => beginAssetDrag(event, asset)}
                onClick={() => setSelectedAssetId(asset.id)}
                data-media-asset-id={asset.id}
              >
                <button
                  className="media-asset-select"
                  type="button"
                  aria-label={`Select ${asset.displayName}`}
                  aria-pressed={selectedAssetId === asset.id}
                  onClick={() => setSelectedAssetId(asset.id)}
                  title={asset.displayName}
                >
                  <span className="media-asset-preview" aria-hidden="true">
                    {asset.type === "image" && asset.status === "ready" ? (
                      <img
                        src={thumbnailUrl}
                        alt=""
                        loading="lazy"
                        onLoad={(event) => {
                          const image = event.currentTarget;
                          if (image.naturalWidth && image.naturalHeight)
                            setImageAspectRatios((current) => ({
                              ...current,
                              [asset.id]:
                                image.naturalWidth / image.naturalHeight,
                            }));
                        }}
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                      />
                    ) : (
                      <span>
                        {asset.type === "audio"
                          ? "♫"
                          : asset.type === "video"
                            ? "▶"
                            : "▧"}
                      </span>
                    )}
                  </span>
                  <span className="media-asset-name">
                    <strong>{asset.displayName}</strong>
                    <small>
                      {asset.type.toUpperCase()} · {asset.id}
                    </small>
                  </span>
                </button>
                <span className={`media-asset-status ${asset.status}`}>
                  {asset.status === "ready"
                    ? "Available"
                    : asset.status === "missing"
                      ? "Missing file"
                      : "Invalid"}
                </span>
                {asset.status !== "ready" && (
                  <span className="media-asset-warning" role="alert">
                    {asset.status === "missing"
                      ? "Original file not found. Registry entry preserved."
                      : asset.message}
                  </span>
                )}
                <div className="media-asset-actions">
                  {(asset.type === "image" || asset.type === "video") &&
                    asset.status === "ready" && (
                      <button
                        type="button"
                        onClick={() => addAssetToTimeline(asset)}
                        aria-label={`Add ${asset.displayName} to Timeline`}
                      >
                        Add
                      </button>
                    )}
                  {asset.type === "audio" && (
                    <button
                      type="button"
                      disabled={asset.status !== "ready" || built}
                      aria-label="Use as soundtrack"
                      onClick={() => void useAsSoundtrack(asset)}
                    >
                      Soundtrack
                    </button>
                  )}
                  <button
                    className="media-remove"
                    type="button"
                    disabled={adding || Boolean(removing) || built}
                    onClick={() => void removeAsset(asset)}
                    aria-label="Remove from Project"
                  >
                    {removing === asset.id ? "…" : "×"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
