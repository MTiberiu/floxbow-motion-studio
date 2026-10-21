import { useCallback, useEffect, useState } from "react";

type MediaAssetView = {
  id: string;
  type: "audio";
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
      const response = await fetch(`/api/media/${encodeURIComponent(projectId)}`);
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

  async function addAudio() {
    if (!snapshot || adding || removing || built) return;
    setAdding(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/media/${encodeURIComponent(projectId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: snapshot.revision }),
      });
      if (response.status === 204) return;
      if (!response.ok) throw new Error(await response.text());
      await refresh();
      setNotice("Audio linked to this project. The original file stays in place.");
    } catch (cause) {
      await refresh();
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAdding(false);
    }
  }

  async function removeAsset(asset: MediaAssetView) {
    if (!snapshot || adding || removing || built) return;
    const confirmed = window.confirm(
      `Remove "${asset.displayName}" from this project? The original audio file will NOT be deleted.`,
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
      setNotice(`${asset.displayName} was removed from this project. The original audio file was not deleted.`);
    } catch (cause) {
      await refresh();
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRemoving(undefined);
    }
  }

  return (
    <section className="media-panel" aria-label="Project media">
      <header className="media-panel-header">
        <div>
          <span className="eyebrow">PROJECT MEDIA</span>
          <h2>Linked audio</h2>
          <p className="muted">
            Audio files are referenced in this project. FloxBow does not copy or move them.
          </p>
        </div>
        <button
          type="button"
          disabled={!projectId || built || loading || adding || Boolean(removing) || !snapshot}
          onClick={addAudio}
        >
          {adding ? "Choosing file…" : "Add Audio"}
        </button>
      </header>

      {built && <p className="media-notice">Media registration is available in the live development workspace.</p>}
      {!projectId && !built && <p className="media-notice">Select or create a project to register audio.</p>}
      {loading && <p className="muted">Loading project media…</p>}
      {error && <p className="media-error" role="alert">{error}</p>}
      {notice && <p className="media-notice" role="status">{notice}</p>}

      {!loading && snapshot && snapshot.assets.length === 0 && (
        <div className="media-empty">
          <span aria-hidden="true">♫</span>
          <p>No audio is registered for this project yet.</p>
        </div>
      )}

      {snapshot && snapshot.assets.length > 0 && (
        <ul className="media-assets">
          {snapshot.assets.map((asset) => (
            <li className={`media-asset media-${asset.status}`} key={asset.id}>
              <span className="media-asset-icon" aria-hidden="true">♫</span>
              <span className="media-asset-name">
                <strong>{asset.displayName}</strong>
                <small>{asset.type.toUpperCase()} · {asset.id}</small>
              </span>
              <span className={`media-asset-status ${asset.status}`}>
                {asset.status === "ready" ? "Available" : asset.status === "missing" ? "Missing file" : "Invalid source"}
              </span>
              {asset.status !== "ready" && (
                <span className="media-asset-warning" role="alert">
                  {asset.status === "missing" ? "The original file cannot be found. The registry entry is preserved." : asset.message}
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
