import { useEffect, useMemo, useState } from "react";
import type { EditTimeline, VisualAssetGroup } from "@motion/sdk/timeline";
import {
  addVisualAssetGroup,
  removeVisualAssetGroup,
  updateVisualAssetGroup,
} from "./asset-groups";

type OrganizerAsset = {
  id: string;
  type: "audio" | "image" | "video";
  displayName: string;
  status: "ready" | "missing" | "invalid";
  message?: string;
};

export function AssetOrganizerDialog({
  projectId,
  groups,
  onEdit,
  onClose,
}: {
  projectId: string;
  groups: readonly VisualAssetGroup[];
  onEdit: (edit: (current: EditTimeline) => EditTimeline) => void;
  onClose: () => void;
}) {
  const [assets, setAssets] = useState<OrganizerAsset[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [category, setCategory] =
    useState<VisualAssetGroup["category"]>("characters");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const imageAssets = useMemo(
    () => assets.filter((asset) => asset.type === "image"),
    [assets],
  );

  useEffect(() => {
    let alive = true;
    void fetch(`/api/media/${encodeURIComponent(projectId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        const data = (await response.json()) as { assets?: OrganizerAsset[] };
        if (alive) setAssets(Array.isArray(data.assets) ? data.assets : []);
      })
      .catch((cause: unknown) => {
        if (alive) setError(String(cause));
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [projectId]);

  function toggleAsset(assetId: string) {
    setSelectedIds((current) =>
      current.includes(assetId)
        ? current.filter((id) => id !== assetId)
        : [...current, assetId],
    );
  }

  function createGroup() {
    const selected = imageAssets.filter((asset) =>
      selectedIds.includes(asset.id),
    );
    if (!selected.length) return;
    const name = window
      .prompt(
        category === "characters" ? "Character group name" : "Asset group name",
        category === "characters"
          ? `Character ${groups.length + 1}`
          : "New group",
      )
      ?.trim();
    if (!name) return;
    const group: VisualAssetGroup = {
      id: `asset-group-${crypto.randomUUID()}`,
      name,
      category,
      members: selected.map((asset) => ({
        id: `variant-${crypto.randomUUID()}`,
        assetId: asset.id,
        label: asset.displayName,
        role: "alternative",
        offsetX: 0,
        offsetY: 0,
      })),
    };
    onEdit((current) => addVisualAssetGroup(current, group));
    setSelectedIds([]);
  }

  function moveMember(
    group: VisualAssetGroup,
    memberId: string,
    delta: number,
  ) {
    onEdit((current) =>
      updateVisualAssetGroup(current, group.id, (nextGroup) => {
        const index = nextGroup.members.findIndex(
          (item) => item.id === memberId,
        );
        const destination = index + delta;
        if (
          index < 0 ||
          destination < 0 ||
          destination >= nextGroup.members.length
        )
          return nextGroup;
        const [member] = nextGroup.members.splice(index, 1);
        nextGroup.members.splice(destination, 0, member);
        return nextGroup;
      }),
    );
  }

  return (
    <div className="asset-organizer-overlay" onMouseDown={onClose}>
      <section
        className="asset-organizer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-organizer-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="asset-organizer-header">
          <div>
            <span className="eyebrow">PROJECT WORKSPACE</span>
            <h2 id="asset-organizer-title">Visual Asset Organizer</h2>
            <p>
              Group registered images into named characters, backgrounds and
              props.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close asset organizer"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {error && (
          <p className="media-error" role="alert">
            {error}
          </p>
        )}
        <div className="asset-organizer-content">
          <section
            className="asset-organizer-library"
            aria-label="Registered images"
          >
            <div className="asset-organizer-section-header">
              <h3>Image assets</h3>
              <span>{selectedIds.length} selected</span>
            </div>
            {loading ? (
              <p className="muted">Loading project images…</p>
            ) : imageAssets.length ? (
              <div className="asset-organizer-gallery">
                {imageAssets.map((asset) => (
                  <button
                    className={`organizer-asset ${selectedIds.includes(asset.id) ? "is-selected" : ""}`}
                    type="button"
                    key={asset.id}
                    aria-pressed={selectedIds.includes(asset.id)}
                    onClick={() => toggleAsset(asset.id)}
                  >
                    <span className="organizer-thumbnail">
                      {asset.status === "ready" ? (
                        <img
                          src={`/api/media/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset.id)}/thumbnail`}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <span aria-hidden="true">▧</span>
                      )}
                    </span>
                    <strong>{asset.displayName}</strong>
                    <small>
                      {asset.status === "ready" ? "Available" : "Missing media"}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">
                No registered image assets. Add PNG files in the Media Library
                first.
              </p>
            )}
            <div className="asset-organizer-create">
              <label>
                Group type
                <select
                  value={category}
                  onChange={(event) =>
                    setCategory(event.target.value as typeof category)
                  }
                >
                  <option value="characters">Characters</option>
                  <option value="backgrounds">Backgrounds</option>
                  <option value="props">Objects / Props</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <button
                type="button"
                disabled={!selectedIds.length}
                onClick={createGroup}
              >
                Create group from selected
              </button>
            </div>
          </section>
          <section className="asset-organizer-groups" aria-label="Asset groups">
            <div className="asset-organizer-section-header">
              <h3>Groups and variants</h3>
              <span>{groups.length} groups</span>
            </div>
            {!groups.length ? (
              <div className="asset-organizer-empty">
                <strong>No groups yet</strong>
                <span>
                  Select multiple images to create a reusable character or asset
                  group.
                </span>
              </div>
            ) : (
              groups.map((group) => (
                <article
                  className="organizer-group"
                  key={group.id}
                  data-asset-group-id={group.id}
                >
                  <header>
                    <div>
                      <strong>{group.name}</strong>
                      <small>
                        {group.category} · {group.members.length} images
                      </small>
                    </div>
                    <div className="organizer-group-actions">
                      {group.category === "characters" && (
                        <button
                          type="button"
                          disabled={
                            !group.members.some(
                              (member) => member.role === "pose",
                            )
                          }
                          onClick={() => {
                            window.dispatchEvent(
                              new CustomEvent("motion-add-character", {
                                detail: {
                                  projectId,
                                  groupId: group.id,
                                  displayName: group.name,
                                },
                              }),
                            );
                            onClose();
                          }}
                        >
                          Place character
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`Rename ${group.name}`}
                        onClick={() => {
                          const name = window
                            .prompt("Group name", group.name)
                            ?.trim();
                          if (!name) return;
                          onEdit((current) =>
                            updateVisualAssetGroup(
                              current,
                              group.id,
                              (item) => ({ ...item, name }),
                            ),
                          );
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete group ${group.name}`}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Remove the ${group.name} group? Registered media files will remain.`,
                            )
                          )
                            return;
                          onEdit((current) =>
                            removeVisualAssetGroup(current, group.id),
                          );
                        }}
                      >
                        Remove group
                      </button>
                    </div>
                  </header>
                  <div className="organizer-variant-list">
                    {group.members.map((member, index) => {
                      const asset = assets.find(
                        (item) => item.id === member.assetId,
                      );
                      return (
                        <div className="organizer-variant" key={member.id}>
                          <span className="organizer-variant-thumbnail">
                            {asset?.status === "ready" ? (
                              <img
                                src={`/api/media/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(member.assetId)}/thumbnail`}
                                alt=""
                                loading="lazy"
                              />
                            ) : (
                              <span title="Media is missing">▧</span>
                            )}
                          </span>
                          <label className="organizer-variant-name">
                            State name
                            <input
                              aria-label={`${group.name} image ${index + 1} name`}
                              defaultValue={member.label}
                              onBlur={(event) => {
                                const label = event.currentTarget.value.trim();
                                if (!label || label === member.label) return;
                                onEdit((current) =>
                                  updateVisualAssetGroup(
                                    current,
                                    group.id,
                                    (item) => ({
                                      ...item,
                                      members: item.members.map((entry) =>
                                        entry.id === member.id
                                          ? { ...entry, label }
                                          : entry,
                                      ),
                                    }),
                                  ),
                                );
                              }}
                            />
                          </label>
                          <label>
                            Meaning
                            <select
                              aria-label={`${group.name} image ${index + 1} role`}
                              value={member.role}
                              onChange={(event) =>
                                onEdit((current) =>
                                  updateVisualAssetGroup(
                                    current,
                                    group.id,
                                    (item) => ({
                                      ...item,
                                      members: item.members.map((entry) =>
                                        entry.id === member.id
                                          ? {
                                              ...entry,
                                              role: event.target.value as
                                                "alternative" | "pose",
                                            }
                                          : entry,
                                      ),
                                    }),
                                  ),
                                )
                              }
                            >
                              <option value="alternative">Alternative</option>
                              <option value="pose">Character pose</option>
                            </select>
                          </label>
                          <label>
                            X offset
                            <input
                              type="number"
                              min={-100}
                              max={100}
                              step={0.1}
                              defaultValue={member.offsetX}
                              onBlur={(event) => {
                                const offsetX = Number(
                                  event.currentTarget.value,
                                );
                                if (
                                  !Number.isFinite(offsetX) ||
                                  offsetX === member.offsetX
                                )
                                  return;
                                onEdit((current) =>
                                  updateVisualAssetGroup(
                                    current,
                                    group.id,
                                    (item) => ({
                                      ...item,
                                      members: item.members.map((entry) =>
                                        entry.id === member.id
                                          ? { ...entry, offsetX }
                                          : entry,
                                      ),
                                    }),
                                  ),
                                );
                              }}
                            />
                          </label>
                          <label>
                            Y offset
                            <input
                              type="number"
                              min={-100}
                              max={100}
                              step={0.1}
                              defaultValue={member.offsetY}
                              onBlur={(event) => {
                                const offsetY = Number(
                                  event.currentTarget.value,
                                );
                                if (
                                  !Number.isFinite(offsetY) ||
                                  offsetY === member.offsetY
                                )
                                  return;
                                onEdit((current) =>
                                  updateVisualAssetGroup(
                                    current,
                                    group.id,
                                    (item) => ({
                                      ...item,
                                      members: item.members.map((entry) =>
                                        entry.id === member.id
                                          ? { ...entry, offsetY }
                                          : entry,
                                      ),
                                    }),
                                  ),
                                );
                              }}
                            />
                          </label>
                          <span className="organizer-asset-id">
                            {asset?.displayName ?? member.assetId}
                          </span>
                          <div className="organizer-order-actions">
                            <button
                              type="button"
                              aria-label={`Move ${member.label} up`}
                              disabled={index === 0}
                              onClick={() => moveMember(group, member.id, -1)}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${member.label} down`}
                              disabled={index === group.members.length - 1}
                              onClick={() => moveMember(group, member.id, 1)}
                            >
                              ↓
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
