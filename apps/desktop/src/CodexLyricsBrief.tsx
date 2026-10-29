import { useMemo, useState } from "react";
import type { ProjectManifest } from "@motion/project-loader/schema";
import { buildCodexLyricsBrief } from "./codex-lyrics-brief";
import { copyTextToClipboard } from "./copy-to-clipboard";

export function CodexLyricsBrief({
  manifest,
}: {
  manifest: ProjectManifest;
}) {
  const [lyrics, setLyrics] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const brief = useMemo(
    () => buildCodexLyricsBrief(manifest, lyrics),
    [manifest, lyrics],
  );

  async function copyBrief() {
    try {
      await copyTextToClipboard(brief);
      setCopyStatus("Copied to clipboard. Paste the complete message into Codex.");
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setCopyStatus(`Copy failed: ${reason}. Select and copy the preview below.`);
    }
  }

  return (
    <section className="codex-lyrics-brief" aria-label="Codex lyrics instructions">
      <header>
        <strong>Prepare a Codex task for this project</strong>
        <span>{manifest.name} · {manifest.id}</span>
      </header>
      <p>
        Paste the corrected lyrics. FloxBow adds the open project’s real file paths
        and instructions for one lyric line per subtitle, preserving karaoke timing
        where it can.
      </p>
      <label htmlFor="codex-lyrics-input">Correct lyrics</label>
      <textarea
        id="codex-lyrics-input"
        value={lyrics}
        onChange={(event) => {
          setLyrics(event.currentTarget.value);
          setCopyStatus("");
        }}
        maxLength={40_000}
        rows={10}
        placeholder="Paste the complete lyrics here, including stanza breaks…"
      />
      <div className="codex-lyrics-paths">
        <span>Project files included automatically</span>
        <code>projects/{manifest.id}/project.json</code>
        {manifest.editTimeline ? (
          <code>projects/{manifest.id}/{manifest.editTimeline}</code>
        ) : (
          <small>No editable Timeline path is declared in this project.</small>
        )}
        {manifest.timeline && (
          <code>projects/{manifest.id}/{manifest.timeline}</code>
        )}
      </div>
      <button type="button" onClick={() => void copyBrief()} disabled={!lyrics.trim()}>
        Copy complete Codex instructions
      </button>
      <span className="codex-lyrics-copy-status" role="status" aria-live="polite">
        {copyStatus}
      </span>
      <details>
        <summary>Preview the full message</summary>
        <pre>{brief}</pre>
      </details>
    </section>
  );
}
