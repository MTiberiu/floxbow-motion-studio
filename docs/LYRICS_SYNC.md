# Lyrics synchronization

The canonical schema is `timelineSchema` in `packages/lyrics-sync/src/index.ts`. Units are seconds. A timeline has version 1, status (`unverified`, `reviewed`, `demo`), optional audio path and lines. Each line has a unique ID, section, optional repeatOf pointing to another line, and words. Each word has unique ID, original text, nullable start/end, confidence 0..1 and provenance (`unmatched`, `imported`, `manual`, `demo`). Word times must increase without overlap. Both boundaries must be null or end must exceed start.

Line boundaries are derived from first/last word, avoiding competing sources of truth. Repeated chorus occurrences get separate IDs and timing; repeatOf only records textual reuse. Text-only input has null boundaries and confidence zero. Import adapters accept word-level segments from OpenAI Whisper, WhisperX or stable-ts. Order-preserving LCS matches normalized recognized words to original text; unmatched words remain unknown. Reconciliation is conservative exact lexical matching, not semantic AI correction or forced alignment. Input is capped at 3000 words to bound matrix memory. Invalid overlapping backend intervals fail validation and require review.

Exports: canonical JSON, flattened word JSON including line IDs, line-level SRT, and LRC. Subtitle exports omit incomplete lines. Millisecond/centisecond rounding handles time carries. SRT/LRC do not preserve confidence/provenance, so canonical JSON must accompany them. The UI supports JSON import, transcript reconciliation, low-confidence highlighting and manual word-boundary adjustments. Edits are exported, not silently written to disk. Timing edits do not alter the preview until the project file is replaced.

## Implemented backend

`npm run sync:lyrics -- <project-id> <relative-audio> <relative-lyrics.txt>` launches a separate Python process using the installed openai-whisper package and an existing `~/.cache/whisper/base.pt`. It returns genuine acoustic word estimates, then reconciles with correct lyrics and writes all formats to out/. It does not download missing models. `STUDIO_PYTHON` selects an environment. Failure is surfaced with a nonzero exit. Requires FFmpeg on PATH. MP3/WAV are accepted by Whisper's FFmpeg loader.

This environment: Whisper 20250625, torch 2.9.1+cu128, CUDA detected, cached base/small/medium models, FFmpeg 4.3.1. A generated English speech WAV was transcribed successfully; all 12 original words were recognized. Triton kernels were unavailable, so Whisper used slower timing implementations successfully. This proves the local speech path, not music alignment accuracy. No supplied song was available to test.

## Research and selection (2026-10-20)

| Option | Compatibility/resources | Accuracy considerations | License / decision |
|---|---|---|---|
| OpenAI Whisper | Python/PyTorch, FFmpeg; CPU or CUDA; cached base model present | Acoustic word estimates; music and repetition may confuse recognition | MIT upstream; existing installation selected for first demonstrable path |
| WhisperX | Additional alignment models, PyTorch/faster-whisper, optional CUDA; model downloads and potentially gated diarization dependencies | Speech-oriented phoneme alignment; numbers/language mismatch and singing need review | BSD-2-Clause repository; each model/dependency must be audited separately; not installed/integrated |
| stable-ts | Whisper-compatible Python ecosystem, optional acceleration/vocal preprocessing | Alignment/refinement APIs are attractive; song behavior needs an actual fixture benchmark | MIT repository; archive status observed in current GitHub results merits maintenance review; not integrated |
| python-lyrics-transcriber | Specialized karaoke transcription/correction pipeline with several external services and media dependencies | Music-oriented workflow, but provider corrections and singing still require measurement | MIT repository; archived and moved into karaoke-gen; assess revision and provider terms before adopting; no code incorporated |

Sources: [OpenAI Whisper](https://github.com/openai/whisper), [WhisperX](https://github.com/m-bain/whisperX), [stable-ts](https://github.com/jianfch/stable-ts), [lyrics-transcriber](https://github.com/nomadkaraoke/python-lyrics-transcriber). Version-specific compatibility must be rechecked before adding a backend. No specialized backend accuracy claim is made without testing.

Next: obtain a licensed song and original lyrics, benchmark speech estimates against manually annotated words, evaluate vocal separation and forced alignment, and add waveform/audio seeking in the inspector. A future AI layer may propose text/timing corrections anchored to acoustic evidence; text alone never establishes timing.

