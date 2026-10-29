# Music Analysis v1 experiment

## Decision under test

Use All-In-One-Infer 3.1.0 for structure and a separate SoundFile/librosa pass for waveform, half-second RMS energy and onset accents. Keep all Python packages and downloaded checkpoints under ignored `.studio/`; do not add them to the application dependency graph or source control. Lyrics Sync stays separate.

## Environment and install

- Host: Windows, Python 3.13.5, PyTorch 2.9.1+cu128, CUDA available.
- Isolated environment: `.studio/music-analysis-runtime`, created with `uv venv --system-site-packages`; AIOI 3.1.0, Demucs-Infer 4.4.0, Madmom-Infer 0.2.0, librosa 1.0.0 and SoundFile 0.14.0 were installed there. The venv reuses the host's compatible PyTorch 2.9.1+cu128 and torchaudio 2.9.1+cu128 pair; an initially duplicated CPU torch wheel shadowed host torchaudio and failed import, so it was removed from this experiment venv.
- Model/package cache: `.studio/music-analysis-cache`; model checkpoint data is not committed.
- Source/license: [All-In-One-Infer](https://github.com/openmirlab/all-in-one-infer) declares MIT for its code; the original [Harmonix checkpoint repository](https://huggingface.co/taejunkim/allinone) declares MIT. [Demucs-Infer](https://github.com/openmirlab/demucs-infer) declares MIT for its code. [Madmom-Infer](https://github.com/openmirlab/madmom-infer) declares BSD-2-Clause for its code; its downloaded pretrained madmom weights are separately licensed CC BY-NC-SA 4.0. FloxBow is open source and does not bundle the optional Python runtime or model weights; users who install/run upstream components are responsible for their terms. No checkpoint is committed. MP3 needs FFmpeg/ffprobe; this demo input is WAV.
- Installation and inference both require network access on first setup/use. A DNS failure correctly left the structure engine unavailable while DSP still completed. A later run with network access downloaded the checkpoint into the isolated cache and completed.

## Real-song result

The demonstration uses the newly created project soundtrack **Mai departe, pas după pas** (239.96 seconds, 48 kHz, stereo). AIOI returned BPM 69, 269 beats, 68 downbeats and 15 time-coded sections. The original labels were retained: `start`, `intro`, `verse`, `chorus`, `bridge`, `outro`, `end`. The beat timestamps' median interval was 0.88 seconds, compared with 60/69 = 0.870 seconds from the returned BPM. This is an internal consistency check, not independent ground truth; no authoritative BPM/section annotation was supplied for this original song.

The DSP pass returned 2,000 waveform buckets, 480 half-second RMS samples and 739 onset accents. It did not inspect, modify or require subtitle data.

## Performance

- Full-song end-to-end API run (including first-use checkpoint download and report persistence): 90.32 seconds on CUDA for the 239.96-second song; peak working set 6,029.25 MB.
- CPU device inference succeeded on a 20-second excerpt: 38.04 seconds, peak working set 2,063.98 MB, BPM 67, 21 beats and 3 sections. This used the compatible host PyTorch build forced onto CPU; a clean CPU-only PyTorch installation was not tested. The observed runtime and memory suggest full-song CPU processing may take several minutes and use substantial RAM.
- The first CPU attempt was misdetected as CUDA because CUDA remained visible to the process and failed with a device-count error. Explicitly setting AIOI's documented `device='cpu'` succeeded. The application still auto-selects CUDA when available and otherwise selects CPU; it has no user-facing algorithm/device selector.
- Initial version 1 did not retain stems. The updated worker now asks AIOI to keep the Demucs WAVs under the ignored local cache, reads all four stems for event detection, and reuses them for later runs of the exact same source hash. The new stem-event path must still be measured and reviewed on the user's new-track acceptance run; the earlier performance figures above do not include event extraction.

## Integration limits

The live development shell exposes a single Music Analysis workspace, background job status/cancel, audio playback, clickable synchronized waveform/energy/beat/event markers, category filters, short attack groups, section list, a partial/complete report status, and atomic `music-analysis.json` persistence keyed to the stable media ID and source hash. The built Electron snapshot does not include this optional host runtime/API yet. Production distribution needs a runtime bootstrap/packaging decision and installation UX. Model-download progress is currently best-effort; the UI says first use may download model files and reports clear partial status on failure.
