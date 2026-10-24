#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_PROJECT = 'ai-video-origin-story';
const MODES = new Set(['summary', 'source', 'fields', 'temporal']);
const MAX_CAPTURE_BYTES = 12 * 1024 * 1024;
const MAX_TIMELINE_BYTES = 32 * 1024 * 1024;
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;

function usage() {
  return `Usage:
  node research/visual-scene-inspection/context-resolver.mjs <capture-id> [options]

Options:
  --project <id>       Project ID (default: ${DEFAULT_PROJECT})
  --target <clip-id>   Resolve one clip; defaults to clips visible in the capture
  --mode <mode>        summary | source | fields | temporal (default: summary)
  --window <frames>    Temporal radius around the captured frame (default: 45)
  --json               Emit compact JSON instead of Markdown
  --help               Show this help

Examples:
  node research/visual-scene-inspection/context-resolver.mjs bf8f74ab-62ff-418d-a9ed-a21311f056fb --target thumbnail-no-editing
  node research/visual-scene-inspection/context-resolver.mjs 6365a3fa-13fc-48b9-9dc9-28237fabbb4c --target tutorial-promise --mode source
  node research/visual-scene-inspection/context-resolver.mjs 6365a3fa-13fc-48b9-9dc9-28237fabbb4c --target tutorial-promise --mode fields`;
}

function parseArgs(argv) {
  const options = { mode: 'summary', project: DEFAULT_PROJECT, window: 45, json: false };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--json') options.json = true;
    else if (['--project', '--target', '--mode', '--window'].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      const key = { '--project': 'project', '--target': 'target', '--mode': 'mode', '--window': 'window' }[arg];
      options[key] = key === 'window' ? Number(value) : value;
    } else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else positional.push(arg);
  }
  if (options.help) return options;
  if (positional.length !== 1) throw new Error('Provide exactly one capture ID.');
  options.captureId = positional[0];
  if (!/^[a-f0-9-]{36}$/i.test(options.captureId)) throw new Error('Capture ID must be a UUID.');
  if (!/^[a-z0-9-]+$/.test(options.project)) throw new Error('Project ID contains unsupported characters.');
  if (options.target && !/^[a-zA-Z0-9_-]+$/.test(options.target)) throw new Error('Target ID contains unsupported characters.');
  if (!MODES.has(options.mode)) throw new Error(`Mode must be one of: ${[...MODES].join(', ')}.`);
  if (!Number.isInteger(options.window) || options.window < 0 || options.window > 1800) throw new Error('--window must be an integer from 0 to 1800 frames.');
  return options;
}

async function readJson(file, maxBytes) {
  const { readFile, stat } = await import('node:fs/promises');
  const info = await stat(file);
  if (info.size > maxBytes) throw new Error(`Refusing oversized context file (${info.size} bytes): ${path.relative(repoRoot, file)}`);
  const text = await readFile(file, 'utf8');
  return { value: JSON.parse(text), text };
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function clipEntries(timeline) {
  const tracks = new Map((timeline.tracks ?? []).map((track) => [track.id, track]));
  return (timeline.clips ?? []).map((clip) => {
    const track = tracks.get(clip.trackId);
    const from = Number(clip.from);
    const duration = Number(clip.durationInFrames);
    return {
      ...clip,
      fromFrame: from,
      endFrame: from + duration,
      trackName: track?.name ?? clip.trackId,
    };
  }).filter((clip) => Number.isFinite(clip.fromFrame) && Number.isFinite(clip.endFrame));
}

function capturedElementRecords(inspection) {
  const records = [];
  for (const item of inspection.elements ?? []) {
    records.push({
      id: item.id,
      label: item.label,
      clipId: item.clipId,
      trackId: item.trackId,
      componentId: item.componentId,
      localFrame: item.clipLocalFrame,
      editability: item.editability ?? 'unknown',
      editTarget: item.editTarget ?? null,
      text: item.text ?? null,
      origin: 'captured-visual',
    });
  }
  for (const item of inspection.timelineElements ?? []) {
    records.push({
      id: item.clipId,
      label: item.label,
      clipId: item.clipId,
      trackId: item.trackId,
      trackName: item.trackName,
      componentId: item.componentId,
      componentName: item.componentName,
      fromFrame: item.fromFrame,
      endFrame: item.endFrame,
      durationInFrames: item.durationInFrames,
      localFrame: item.localFrame,
      content: item.content,
      props: item.props,
      editability: item.editability ?? (item.editableFields?.length ? 'declared-fields' : 'timeline-data-only'),
      editableFields: item.editableFields ?? [],
      sourceRef: item.sourceRef ?? null,
      origin: 'captured-timeline-index',
    });
  }
  return records;
}

function makeSourceIndex(source, projectId) {
  const lines = source.split(/\r?\n/);
  const modules = new Map();
  for (let i = 0; i < lines.length; i += 1) {
    const idMatch = lines[i].match(/\bid:\s*["']([^"']+)["']/);
    if (!idMatch) continue;
    const blockStart = findPrevious(lines, i, /^const\s+\w+\s*:\s*EditableComponent\s*=\s*\{/);
    if (blockStart < 0) continue;
    const blockEnd = findNext(lines, blockStart + 1, /^\};\s*$/);
    if (blockEnd < 0 || i > blockEnd) continue;
    const block = lines.slice(blockStart, blockEnd + 1).join('\n');
    const componentMatch = block.match(/\bcomponent:\s*([A-Za-z_$][\w$]*)/);
    if (componentMatch) modules.set(idMatch[1], { component: componentMatch[1], moduleStart: blockStart + 1, moduleEnd: blockEnd + 1 });
  }
  return {
    lines,
    modules,
    projectId,
    fingerprint: sha256(source),
  };
}

function findPrevious(lines, start, regex) {
  for (let i = start; i >= 0; i -= 1) if (regex.test(lines[i])) return i;
  return -1;
}

function findNext(lines, start, regex) {
  for (let i = start; i < lines.length; i += 1) if (regex.test(lines[i])) return i;
  return -1;
}

function sourceSymbol(sourceIndex, componentId) {
  const registered = sourceIndex.modules.get(componentId);
  if (!registered) return { status: 'unresolved', note: `No EditableComponent registration for component ID ${componentId}.` };
  const { component } = registered;
  const escaped = component.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let start = sourceIndex.lines.findIndex((line) => new RegExp(`^\\s*function\\s+${escaped}\\s*\\(`).test(line));
  let declaration = 'function';
  if (start < 0) {
    start = sourceIndex.lines.findIndex((line) => new RegExp(`^\\s*const\\s+${escaped}\\s*=`).test(line));
    declaration = 'const';
  }
  if (start < 0) return { status: 'registration-only', component, registration: registered };
  let end = sourceIndex.lines.length - 1;
  for (let i = start + 1; i < sourceIndex.lines.length; i += 1) {
    if (/^\s*(?:function\s+[A-Za-z_$]|const\s+\w+\s*:\s*EditableComponent\s*=)/.test(sourceIndex.lines[i])) {
      end = i - 1;
      break;
    }
  }
  return {
    status: 'resolved-symbol',
    component,
    file: `projects/${sourceIndex.projectId}/Composition.tsx`,
    declaration,
    startLine: start + 1,
    endLine: end + 1,
    registration: registered,
    sourceFingerprint: sourceIndex.fingerprint,
    confidence: 'symbol-level; expression causality is not inferred',
  };
}

function localHelperSymbols(sourceIndex, mainSource) {
  if (!mainSource?.startLine || !mainSource?.endLine) return [];
  const componentLines = sourceIndex.lines.slice(mainSource.startLine - 1, mainSource.endLine);
  const referenced = new Set([...componentLines.join('\n').matchAll(/<([A-Z][A-Za-z0-9_$]*)\b/g)].map((match) => match[1]));
  const helpers = [];
  for (const name of referenced) {
    if (name === mainSource.component) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const start = sourceIndex.lines.findIndex((line) => new RegExp(`^\\s*function\\s+${escaped}\\s*\\(`).test(line));
    if (start < 0) continue;
    let end = sourceIndex.lines.length - 1;
    for (let i = start + 1; i < sourceIndex.lines.length; i += 1) {
      if (/^\s*(?:function\s+[A-Za-z_$]|const\s+\w+\s*:\s*EditableComponent\s*=)/.test(sourceIndex.lines[i])) {
        end = i - 1;
        break;
      }
    }
    helpers.push({
      component: name,
      file: mainSource.file,
      startLine: start + 1,
      endLine: end + 1,
      sourceFingerprint: sourceIndex.fingerprint,
      confidence: 'direct local JSX helper reference; syntax-level only',
    });
  }
  return helpers;
}

function fieldSchema(sourceIndex, componentId) {
  const registration = sourceIndex.modules.get(componentId);
  if (!registration) return [];
  const blockLines = sourceIndex.lines.slice(registration.moduleStart - 1, registration.moduleEnd);
  const fieldsAt = blockLines.findIndex((line) => /^\s*fields:\s*\[/.test(line));
  if (fieldsAt < 0) return [];
  const fields = [];
  let depth = 0;
  let active = '';
  for (let i = fieldsAt; i < blockLines.length; i += 1) {
    const line = blockLines[i];
    if (i === fieldsAt) depth = (line.match(/\[/g) ?? []).length - (line.match(/\]/g) ?? []).length;
    else depth += (line.match(/\[/g) ?? []).length - (line.match(/\]/g) ?? []).length;
    active += `${line}\n`;
    if (active.includes('{') && active.includes('}')) {
      const key = active.match(/\bkey:\s*["']([^"']+)["']/)?.[1];
      const target = active.match(/\btarget:\s*["']([^"']+)["']/)?.[1];
      const label = active.match(/\blabel:\s*["']([^"']+)["']/)?.[1];
      const type = active.match(/\btype:\s*["']([^"']+)["']/)?.[1];
      const defaultValue = active.match(/\bdefault:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|true|false|null|-?\d+(?:\.\d+)?)/)?.[1];
      const options = active.match(/\boptions:\s*\[([^\]]*)\]/)?.[1]?.match(/["']([^"']+)["']/g)?.map((s) => s.slice(1, -1));
      if (key) fields.push({ key, target: target ?? null, label: label ?? key, type: type ?? 'unknown', ...(defaultValue !== undefined ? { default: parseLiteral(defaultValue) } : {}), ...(options?.length ? { options } : {}) });
      active = '';
    }
    if (depth <= 0 && i > fieldsAt) break;
  }
  return fields;
}

function parseLiteral(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d/.test(value)) return Number(value);
  try { return JSON.parse(value); } catch { return value.slice(1, -1); }
}

function eventContext(clips, frame, window) {
  const low = frame - window;
  const high = frame + window;
  const candidates = clips.filter((clip) => clip.fromFrame <= high && clip.endFrame >= low);
  const active = candidates.filter((clip) => clip.fromFrame <= frame && frame < clip.endFrame);
  const events = [];
  for (const clip of candidates) {
    const transitionLike = /transition|dissolve|wipe|crossfade|portal|camera.?pass/i.test(`${clip.componentId} ${clip.label} ${clip.content?.kind ?? ''}`);
    for (const [kind, atFrame] of [['start', clip.fromFrame], ['end', clip.endFrame]]) {
      if ((kind === 'start' && atFrame >= low && atFrame <= high) || (kind === 'end' && atFrame >= low && atFrame <= high)) {
        events.push({ frame: atFrame, kind, clipId: clip.id, label: clip.label, trackId: clip.trackId, trackName: clip.trackName, componentId: clip.componentId, transitionLike });
      }
    }
  }
  events.sort((a, b) => a.frame - b.frame || (a.kind === b.kind ? a.clipId.localeCompare(b.clipId) : a.kind === 'end' ? -1 : 1));
  return {
    window: { fromFrame: low, toFrame: high },
    active: active.map((clip) => ({ clipId: clip.id, label: clip.label, trackId: clip.trackId, trackName: clip.trackName, componentId: clip.componentId, fromFrame: clip.fromFrame, endFrame: clip.endFrame, localFrame: frame - clip.fromFrame })),
    boundaries: events.slice(0, 80),
    overlapCount: active.length,
  };
}

function resolveTarget(targetId, captured, canonicalClips, sourceIndex, capturedFrame) {
  const capturedRecords = captured.filter((item) => item.clipId === targetId || item.id === targetId);
  const capturedTimeline = capturedRecords.find((item) => item.origin === 'captured-timeline-index');
  const visual = capturedRecords.filter((item) => item.origin === 'captured-visual');
  const currentClip = canonicalClips.find((item) => item.id === targetId);
  const componentId = capturedTimeline?.componentId ?? visual.find((item) => item.componentId)?.componentId ?? currentClip?.componentId;
  const source = componentId ? sourceSymbol(sourceIndex, componentId) : null;
  const changedValues = [];
  if (capturedTimeline && currentClip) {
    for (const root of ['content', 'props']) {
      const before = capturedTimeline[root] ?? {};
      const after = currentClip[root] ?? {};
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changedValues.push({ path: `${root}.${key}`, captured: before[key], current: after[key] });
      }
    }
  }
  return {
    clipId: targetId,
    captured: capturedTimeline ?? null,
    visibleElements: visual,
    currentCanonicalClip: currentClip ? {
      id: currentClip.id,
      label: currentClip.label,
      trackId: currentClip.trackId,
      trackName: currentClip.trackName,
      componentId: currentClip.componentId,
      fromFrame: currentClip.fromFrame,
      durationInFrames: currentClip.durationInFrames,
      endFrame: currentClip.endFrame,
      localFrameAtCapture: capturedFrame >= currentClip.fromFrame && capturedFrame < currentClip.endFrame ? capturedFrame - currentClip.fromFrame : null,
      content: currentClip.content,
      props: currentClip.props,
    } : null,
    componentId: componentId ?? null,
    source,
    fieldSchema: componentId ? fieldSchema(sourceIndex, componentId) : [],
    changedValues,
    historicalValuePolicy: capturedTimeline ? 'captured values are historical and only current if revision hashes match' : 'capture did not include a Timeline clip snapshot; current canonical values are not historical capture values',
  };
}

function markdown(result, mode) {
  const lines = [
    `# Visual context: ${result.captureId}`,
    '',
    `- Project: \`${result.projectId}\``,
    `- Capture: frame ${result.capture.frame} (${result.capture.timeSeconds}s), ${result.capture.fps} FPS; state version ${result.capture.stateVersion ?? 'not recorded'}`,
    `- Timeline revision: captured \`${result.revisions.capturedTimeline ?? 'not recorded'}\`; current \`${result.revisions.currentTimeline}\` — **${result.revisions.timelineStatus}**`,
    `- Composition source: current SHA-256 \`${result.revisions.currentSource}\`; capture fingerprint ${result.revisions.capturedSource ?? 'not recorded'}`,
  ];
  if (result.capture.selectedClipId) lines.push(`- Editor selection at capture: \`${result.capture.selectedClipId}\``);
  lines.push('', '## Target context');
  for (const target of result.targets) {
    lines.push('', `### \`${target.clipId}\``);
    if (target.visibleElements.length) {
      lines.push('Captured visual nodes:');
      for (const item of target.visibleElements) lines.push(`- \`${item.id}\` — ${item.label}; component \`${item.componentId}\`, captured local frame ${item.localFrame}; ${item.editability}${item.editTarget ? `; edit target \`${item.editTarget}\`` : ''}`);
    }
    if (target.captured) lines.push(`Captured Timeline entry: ${target.captured.label}; ${target.captured.fromFrame}–${target.captured.endFrame} (local ${target.captured.localFrame}); component \`${target.captured.componentId}\`; ${target.captured.editability}.`);
    else if (!target.visibleElements.length) lines.push('- Not present in the captured visible elements or Timeline index.');
    if (target.currentCanonicalClip) {
      const c = target.currentCanonicalClip;
      lines.push(`Current canonical clip: ${c.label}; ${c.fromFrame}–${c.endFrame} (duration ${c.durationInFrames}); component \`${c.componentId}\`; current local frame at captured time ${c.localFrameAtCapture ?? 'outside clip'}.`);
      lines.push(`Current content/props (current revision only): \`${JSON.stringify({ content: c.content, props: c.props })}\``);
    } else lines.push('- No current Timeline clip with this ID.');
    if (target.changedValues.length) lines.push(`Changed since capture: ${target.changedValues.map((item) => `\`${item.path}\` ${JSON.stringify(item.captured)} → ${JSON.stringify(item.current)}`).join('; ')}.`);
    lines.push(`Historical data rule: ${target.historicalValuePolicy}.`);
    if (target.source?.status === 'resolved-symbol') lines.push(`Source: \`${target.source.file}:${target.source.startLine}-${target.source.endLine}\`, symbol \`${target.source.component}\` (${target.source.confidence}); source SHA-256 \`${target.source.sourceFingerprint}\`.`);
    else if (target.source) lines.push(`Source lookup: ${target.source.note ?? target.source.status}.`);
    if (target.fieldSchema.length) lines.push(`Current component field schema: ${target.fieldSchema.map((f) => `\`${f.key}\` (${f.type}, ${f.target ?? 'target unspecified'})`).join(', ')}.`);
    if (target.captured?.editableFields?.length && mode === 'summary') {
      lines.push(`Captured editable values (historical unless capture revision is current): ${target.captured.editableFields.map((f) => `\`${f.key}\`=${JSON.stringify(f.value)}`).join('; ')}.`);
    }
  }
  if (result.temporal) {
    lines.push('', `## Nearby Timeline events (frames ${result.temporal.window.fromFrame}–${result.temporal.window.toFrame})`, `Active clips at frame ${result.capture.frame}: ${result.temporal.overlapCount}.`);
    for (const clip of result.temporal.active) lines.push(`- Overlap: \`${clip.clipId}\` (${clip.trackName}), ${clip.fromFrame}–${clip.endFrame}, local frame ${clip.localFrame} — ${clip.label}`);
    if (!result.temporal.active.length) lines.push('- No canonical Timeline clip is active at this frame.');
    for (const event of result.temporal.boundaries) lines.push(`- F${event.frame} ${event.kind}${event.transitionLike ? ' [transition-like]' : ''}: \`${event.clipId}\` (${event.trackName}) — ${event.label}`);
    if (!result.temporal.boundaries.length) lines.push('- No clip boundaries in this window.');
  }
  if (mode === 'source') {
    lines.push('', '## Source excerpts');
    for (const target of result.targets) {
      if (!target.source?.excerpt) continue;
      lines.push('', `### ${target.source.component} — ${target.source.file}:${target.source.excerpt.startLine}-${target.source.excerpt.endLine}`, '```tsx', target.source.excerpt.text, '```');
      for (const helper of target.source.relatedExcerpts ?? []) lines.push('', `### Local helper ${helper.component} — ${helper.file}:${helper.startLine}-${helper.endLine}`, '```tsx', helper.text, '```');
    }
  }
  if (mode === 'fields') {
    lines.push('', '## Editable schema and captured fields');
    for (const target of result.targets) {
      lines.push('', `### ${target.clipId}`);
      if (target.captured?.editableFields?.length) lines.push('Captured field values:', '```json', JSON.stringify(target.captured.editableFields, null, 2), '```');
      lines.push('Current component field schema:', '```json', JSON.stringify(target.fieldSchema, null, 2), '```');
    }
  }
  return lines.join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(usage()); return; }
  const projectDir = path.join(repoRoot, 'projects', options.project);
  const captureDir = path.join(projectDir, '.floxbow', 'visual-inspection', options.captureId);
  const inspectionPath = path.join(captureDir, 'inspection.json');
  const timelinePath = path.join(projectDir, 'edit-timeline.json');
  const compositionPath = path.join(projectDir, 'Composition.tsx');
  const [captureFile, timelineFile, compositionFile] = await Promise.all([
    readJson(inspectionPath, MAX_CAPTURE_BYTES),
    readJson(timelinePath, MAX_TIMELINE_BYTES),
    (async () => {
      const { stat } = await import('node:fs/promises');
      const info = await stat(compositionPath);
      if (info.size > MAX_SOURCE_BYTES) throw new Error(`Refusing oversized source file (${info.size} bytes).`);
      const text = await readFile(compositionPath, 'utf8');
      return { value: text, text };
    })(),
  ]);
  const inspection = captureFile.value;
  if (inspection.schemaVersion !== 1 && inspection.schemaVersion !== 2) throw new Error(`Unsupported inspection schema version: ${inspection.schemaVersion}`);
  if (inspection.projectId !== options.project) throw new Error(`Capture belongs to ${inspection.projectId}, not ${options.project}.`);
  if (!Number.isInteger(inspection.frame) || inspection.frame < 0) throw new Error('Capture frame is missing or invalid.');
  const currentTimelineHash = sha256(timelineFile.text);
  const capturedTimelineHash = inspection.editor?.revision ?? null;
  const timelineStatus = capturedTimelineHash ? (capturedTimelineHash === currentTimelineHash ? 'current' : 'stale') : 'unknown';
  const timeline = timelineFile.value;
  const canonicalClips = clipEntries(timeline);
  const sourceIndex = makeSourceIndex(compositionFile.value, options.project);
  const captured = capturedElementRecords(inspection);
  const targetIds = options.target
    ? [options.target]
    : [...new Set(captured.map((item) => item.clipId).filter(Boolean))];
  if (!targetIds.length) throw new Error('Capture has no resolvable visible or indexed clip. Use --target <clip-id> to query the current Timeline.');
  const targets = targetIds.map((id) => resolveTarget(id, captured, canonicalClips, sourceIndex, inspection.frame));
  for (const target of targets) {
    if (options.mode === 'source' && target.source?.status === 'resolved-symbol') {
      const cap = 220;
      const start = target.source.startLine - 1;
      const end = Math.min(target.source.endLine, start + cap);
      target.source.excerpt = { startLine: start + 1, endLine: end, text: sourceIndex.lines.slice(start, end).join('\n') };
      if (end < target.source.endLine) target.source.excerpt.truncated = true;
      target.source.relatedExcerpts = localHelperSymbols(sourceIndex, target.source).map((helper) => {
        const helperStart = helper.startLine - 1;
        const helperEnd = Math.min(helper.endLine, helperStart + cap);
        return { ...helper, endLine: helperEnd, text: sourceIndex.lines.slice(helperStart, helperEnd).join('\n'), ...(helperEnd < helper.endLine ? { truncated: true } : {}) };
      });
    }
  }
  const temporal = options.mode === 'source' || options.mode === 'summary' || options.mode === 'temporal'
    ? eventContext(canonicalClips, inspection.frame, options.window)
    : null;
  const result = {
    resolver: 'visual-context-resolver-v1',
    readOnly: true,
    captureId: options.captureId,
    projectId: inspection.projectId,
    capture: {
      schemaVersion: inspection.schemaVersion,
      capturedAt: inspection.capturedAt,
      frame: inspection.frame,
      timeSeconds: inspection.timeSeconds,
      fps: inspection.fps,
      durationInFrames: inspection.durationInFrames,
      stateVersion: inspection.editor?.stateVersion ?? null,
      selectedClipId: inspection.editor?.selectedClipId || null,
      screenshot: path.relative(repoRoot, path.join(captureDir, 'frame.png')).replaceAll('\\', '/'),
    },
    revisions: {
      capturedTimeline: capturedTimelineHash,
      currentTimeline: currentTimelineHash,
      timelineStatus,
      capturedSource: inspection.sourceFingerprint ?? null,
      currentSource: sourceIndex.fingerprint,
      sourceStatus: inspection.sourceFingerprint ? (inspection.sourceFingerprint === sourceIndex.fingerprint ? 'current' : 'stale') : 'not-recorded-at-capture',
    },
    targets,
    temporal,
    limitations: [
      'Source mapping identifies registered component symbols and syntax ranges; it does not infer arbitrary expression causality.',
      'Timeline events include canonical clip boundaries only. Internal component beats require explicit semantic metadata.',
      'This command is read-only and never edits project files.',
    ],
  };
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else console.log(markdown(result, options.mode));
}

main().catch((error) => {
  console.error(`Context resolver: ${error.message}`);
  process.exitCode = 1;
});
