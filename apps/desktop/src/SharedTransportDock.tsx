import { useMemo, useState } from "react";
import { useWorkspaceManager } from "./WorkspaceManager";
import { useSharedTimelineTransport } from "./shared-timeline-transport";
import "./shared-transport-dock.css";

function formatTime(frame: number, fps: number) {
  const seconds = Math.max(0, frame / fps);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

export function SharedTransportDock() {
  const transport = useSharedTimelineTransport();
  const { activatePanel } = useWorkspaceManager();
  const [overviewVisible, setOverviewVisible] = useState(true);
  const [audioClips, subtitleClips] = useMemo(() => {
    if (!overviewVisible) return [[], []] as const;
    const clips = transport?.timeline.clips ?? [];
    return [
      clips.filter((clip) => {
        const track = transport?.timeline.tracks.find(
          (item) => item.id === clip.trackId,
        );
        return track?.kind === "audio" || clip.componentId === "soundtrack" || clip.componentId === "video-audio";
      }),
      clips.filter((clip) => clip.componentId === "subtitles"),
    ];
  }, [overviewVisible, transport?.timeline]);
  const duration = transport?.timeline.durationInFrames ?? 1;
  const frame = Math.min(duration - 1, transport?.frame ?? 0);
  const progress = (frame / Math.max(1, duration - 1)) * 100;

  if (!transport) return null;

  return (
    <section className={`shared-transport-dock${overviewVisible ? "" : " is-collapsed"}`} aria-label="Shared project playback">
      <div className="shared-transport-controls">
        <button
          type="button"
          className="shared-transport-play"
          onClick={transport.playing ? transport.pause : transport.play}
          aria-label={transport.playing ? "Pause project audio" : "Play project audio"}
          title={transport.playing ? "Pause" : "Play"}
        >
          {transport.playing ? "Ⅱ" : "▶"}
        </button>
        <div className="shared-transport-project">
          <strong>{transport.projectId}</strong>
          <span>{audioClips.length ? "Timeline audio" : "No audio clip on the Timeline"}</span>
        </div>
        <time>{formatTime(frame, transport.fps)} <span>/ {formatTime(duration, transport.fps)}</span></time>
        <label className="shared-transport-volume" title="Preview volume">
          <span>Vol</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={transport.masterVolume}
            onChange={(event) => transport.setVolume(Number(event.currentTarget.value))}
            aria-label="Preview volume"
          />
        </label>
        <button type="button" onClick={() => setOverviewVisible((visible) => !visible)} aria-expanded={overviewVisible}>
          {overviewVisible ? "Hide timeline" : "Show timeline"}
        </button>
        <button type="button" onClick={() => activatePanel("editor")}>Open Video Editor</button>
      </div>
      {overviewVisible && <div className="shared-transport-ruler" aria-label="Shared Timeline overview">
        <div className="shared-ruler-track-label">Audio</div>
        <div className="shared-ruler-lane">
          {audioClips.map((clip) => (
            <span
              key={clip.id}
              className="shared-ruler-clip is-audio"
              style={{ left: `${(clip.from / duration) * 100}%`, width: `${(clip.durationInFrames / duration) * 100}%` }}
              title={clip.label ?? "Audio"}
            />
          ))}
          <span className="shared-ruler-playhead" style={{ left: `${progress}%` }} />
          <input
            type="range"
            min="0"
            max={duration - 1}
            step="1"
            value={frame}
            onChange={(event) => transport.seek(Number(event.currentTarget.value))}
            aria-label="Seek shared Timeline"
          />
        </div>
        <div className="shared-ruler-track-label">Lyrics</div>
        <div className="shared-ruler-lane is-lyrics">
          {subtitleClips.map((clip) => (
            <span
              key={clip.id}
              className="shared-ruler-clip is-lyric"
              style={{ left: `${(clip.from / duration) * 100}%`, width: `${Math.max(0.15, (clip.durationInFrames / duration) * 100)}%` }}
              title={clip.label ?? "Lyric"}
            />
          ))}
          <span className="shared-ruler-playhead" style={{ left: `${progress}%` }} />
        </div>
      </div>}
    </section>
  );
}
