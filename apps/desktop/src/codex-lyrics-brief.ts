import type { ProjectManifest } from "@motion/project-loader/schema";

export function buildCodexLyricsBrief(
  manifest: ProjectManifest,
  lyrics: string,
): string {
  const projectRoot = `projects/${manifest.id}`;
  const projectFile = `${projectRoot}/project.json`;
  const editTimeline = manifest.editTimeline
    ? `${projectRoot}/${manifest.editTimeline}`
    : null;
  const lyricsTimeline = manifest.timeline
    ? `${projectRoot}/${manifest.timeline}`
    : null;
  const paths = [
    `- Project folder: ${projectRoot}/`,
    `- Project manifest: ${projectFile}`,
    `- Composition entry (inspect only unless a project-local issue requires a change): ${projectRoot}/${manifest.entry}`,
    editTimeline
      ? `- Editable Timeline declared by the manifest: ${editTimeline}`
      : "- Editable Timeline: no editTimeline path is declared; inspect the manifest and report the actual subtitle source before editing.",
    lyricsTimeline
      ? `- Lyrics timing file declared by the manifest: ${lyricsTimeline}`
      : "- Lyrics timing file: no timeline path is declared in the manifest.",
  ];

  return [
    "# FloxBow subtitle correction task",
    "",
    "You are Codex working in the FloxBow repository. The repository root is the app/ folder that is already open in your workspace. Use repository-relative paths below; do not use a machine-specific absolute path.",
    "",
    "## Project",
    "",
    `- Project name: ${manifest.name}`,
    `- Project ID: ${manifest.id}`,
    `- Canvas: ${manifest.width} × ${manifest.height} at ${manifest.fps} fps`,
    ...paths,
    "",
    "## Before editing",
    "",
    "1. Read the repository AGENTS.md and follow its video-project rules. Read docs/LYRICS_SYNC.md and docs/TIMELINE_EDITOR.md for the subtitle and editable Timeline contracts.",
    "2. Inspect the manifest and listed project files. Confirm which file contains the current subtitle clips and word-level karaoke timings. Treat the manifest's editTimeline path as the editable Timeline source when it exists. The timeline path can hold a separate lyrics timing document; do not overwrite or duplicate data across these files blindly.",
    `3. Make changes only inside ${projectRoot}/. Do not modify shared application code, packages, Whisper output, audio, or another project.`,
    "",
    "## Task",
    "",
    "Correct the project's existing subtitle text using the lyrics supplied below. Show one sung lyric line per subtitle clip, in the same order as the song. Do not combine neighboring lines into multi-line captions. Keep section headings such as verse or chorus as metadata where the project already uses them; do not turn headings into sung captions.",
    "",
    "Preserve the existing karaoke highlighting and all valid timing evidence as much as possible:",
    "",
    "- Keep each existing subtitle clip ID and its start/duration when the lyric line still corresponds to that clip. Keep the project frame rate, soundtrack, visual clips, tracks, and composition unchanged.",
    "- Match old timed words to corrected lyric tokens in order (use normalized text matching/LCS so punctuation and Romanian diacritics do not unnecessarily break a match). Reuse matched words' existing time intervals and IDs as anchors.",
    "- When one recognized token becomes multiple lyric words (for example, mererosii → mere rosii), preserve its interval as the available anchor span and divide only that span among the new words, using reasonable syllable/character weighting. When corrected text inserts words between matched anchors, estimate only the uncovered interval between those anchors. Keep word intervals ordered, positive, non-overlapping, and inside the subtitle clip.",
    "- If an entire line has no usable word timings, estimate timings across that clip's existing audio interval. Mark estimated timing with content.wordTimingSource = estimated where the current schema supports it. Preserve Whisper provenance only for timings that remain Whisper-derived and valid. Timing estimates are approximate; do not claim they were verified against audio unless you actually listen and check them.",
    "- If the supplied words cannot be aligned safely to the existing clips, make the smallest project-local correction possible and list the uncertain lines for review instead of shifting unrelated subtitles or changing the soundtrack.",
    "- Preserve normal spaces and punctuation in the visible caption text. Each clip's visible content.text should contain exactly one lyric line. Its content.words must follow that text token-for-token so karaoke highlighting does not concatenate words or lose spaces. Keep unique IDs for any newly created word or clip.",
    "",
    "After editing, validate the project JSON and confirm that every sung line has one subtitle clip and that karaoke word text matches each clip's visible text. Do not save unrelated formatting changes. In your final response, list the exact project-relative files changed, the number of corrected subtitle clips, which timings were preserved versus estimated, any lines that need audio review, and the checks actually run.",
    "",
    "## Correct lyrics",
    "",
    "<LYRICS>",
    lyrics.trim(),
    "</LYRICS>",
    "",
  ].join("\n");
}
