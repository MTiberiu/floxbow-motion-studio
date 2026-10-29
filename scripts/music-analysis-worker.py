"""Isolated local music analysis worker for FloxBow.

Writes one JSON result to stdout. Progress and diagnostic messages go to stderr.
The host resolves registered media IDs before invoking this process.
"""

from __future__ import annotations

import json
import contextlib
import ctypes
import math
import os
import shutil
import sys
import threading
import time
import traceback
from pathlib import Path


def emit_progress(stage: str, message: str) -> None:
    print(json.dumps({"type": "progress", "stage": stage, "message": message}), file=sys.stderr, flush=True)


def process_peak_memory_mb() -> float | None:
    if os.name == "nt":
        class MemoryCounters(ctypes.Structure):
            _fields_ = [
                ("cb", ctypes.c_ulong), ("PageFaultCount", ctypes.c_ulong),
                ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t),
                ("PrivateUsage", ctypes.c_size_t),
            ]
        counters = MemoryCounters()
        counters.cb = ctypes.sizeof(counters)
        process = ctypes.WinDLL("kernel32", use_last_error=True).GetCurrentProcess()
        getter = ctypes.WinDLL("psapi", use_last_error=True).GetProcessMemoryInfo
        getter.argtypes = [ctypes.c_void_p, ctypes.POINTER(MemoryCounters), ctypes.c_ulong]
        getter.restype = ctypes.c_bool
        if getter(process, ctypes.byref(counters), counters.cb):
            return round(counters.PeakWorkingSetSize / (1024 * 1024), 2)
        return None


STEM_NAMES = ("drums", "bass", "vocals", "other")


def make_event(events: list, source: str, category: str, seconds: float, method: str,
               intensity: float | None = None, end_seconds: float | None = None) -> dict:
    event = {
        "id": f"{source}-{category}-{len(events) + 1:06d}",
        "time": round(max(0.0, seconds), 4),
        "category": category,
        "source": source,
        "method": method,
    }
    if intensity is not None:
        event["intensity"] = round(min(1.0, max(0.0, intensity)), 4)
    if end_seconds is not None and end_seconds > seconds:
        event["endTime"] = round(end_seconds, 4)
    events.append(event)
    return event


def classify_drum_hit(y, sample_rate: int, seconds: float, np) -> str:
    """Conservative stem-local spectral heuristic; labels are explicitly *_like."""
    start = max(0, int((seconds - 0.035) * sample_rate))
    end = min(len(y), int((seconds + 0.09) * sample_rate))
    window = y[start:end]
    if len(window) < 32:
        return "drum_hit"
    spectrum = np.abs(np.fft.rfft(window * np.hanning(len(window)))) ** 2
    frequencies = np.fft.rfftfreq(len(window), 1.0 / sample_rate)
    total = float(np.sum(spectrum))
    if total <= 1e-12:
        return "drum_hit"
    low = float(np.sum(spectrum[(frequencies >= 35) & (frequencies < 150)])) / total
    mid = float(np.sum(spectrum[(frequencies >= 150) & (frequencies < 2500)])) / total
    high = float(np.sum(spectrum[(frequencies >= 2500) & (frequencies < 12000)])) / total
    if low >= 0.68:
        return "kick_like"
    if high >= 0.72:
        return "hi_hat_like"
    if mid >= 0.58 and high >= 0.20:
        return "snare_like"
    return "drum_hit"


def detect_onset_events(y, sample_rate: int, source: str, category: str, librosa, np, events: list) -> list:
    if len(y) == 0 or float(np.max(np.abs(y))) < 1e-5:
        return []
    analysis_rate = 22050
    analysis = librosa.resample(y, orig_sr=sample_rate, target_sr=analysis_rate) if sample_rate != analysis_rate else y
    hop = 256
    envelope = librosa.onset.onset_strength(y=analysis, sr=analysis_rate, hop_length=hop)
    frames = librosa.onset.onset_detect(onset_envelope=envelope, sr=analysis_rate, hop_length=hop,
                                        backtrack=False, units="frames")
    strengths = envelope[frames] if len(frames) else np.asarray([])
    peak = float(np.max(strengths)) if len(strengths) else 0.0
    found = []
    for frame, strength in zip(frames, strengths):
        seconds = float(librosa.frames_to_time(frame, sr=analysis_rate, hop_length=hop))
        label = category
        method = "librosa spectral-flux onset on Demucs stem"
        if source == "drums":
            label = classify_drum_hit(y, sample_rate, seconds, np)
            method += "; conservative stem-band heuristic" if label != "drum_hit" else ""
        event = make_event(events, source, label, seconds, method, float(strength) / peak if peak else None)
        found.append(event)
    return found


def group_attacks(events: list, source: str, max_gap: float) -> list:
    eligible = sorted((event for event in events if event["source"] == source and event["category"] in {
        "drum_hit", "kick_like", "snare_like", "hi_hat_like", "bass_attack", "other_transient"
    }), key=lambda event: event["time"])
    clusters = []
    current = []
    for event in eligible:
        if current and event["time"] - current[-1]["time"] > max_gap:
            if len(current) >= 2:
                clusters.append(current)
            current = []
        current.append(event)
    if len(current) >= 2:
        clusters.append(current)
    groups = []
    for cluster in clusters:
        # Four-event windows retain useful short patterns without reporting long undifferentiated runs.
        windows = [cluster[index:index + 4] for index in range(0, len(cluster), 4) if len(cluster[index:index + 4]) >= 2]
        for index, window in enumerate(windows):
            groups.append({
                "id": f"{source}-group-{len(groups) + 1:05d}",
                "start": window[0]["time"],
                "end": window[-1].get("endTime", window[-1]["time"]),
                "source": source,
                "count": len(window),
                "eventIds": [event["id"] for event in window],
                "pattern": f"{len(window)} successive { {'drums': 'drum', 'bass': 'bass', 'other': 'other'}[source] } attacks",
            })
    return groups


def detect_vocal_activity(y, sample_rate: int, events: list, np) -> None:
    if len(y) == 0:
        return
    window = max(1, int(sample_rate * 0.05))
    rms = []
    for start in range(0, len(y), window):
        part = y[start:start + window]
        rms.append(float(np.sqrt(np.mean(np.square(part, dtype=np.float64)))) if len(part) else 0.0)
    peak = max(rms, default=0.0)
    if peak < 1e-5:
        return
    threshold = max(0.003, peak * 0.09)
    active = [value >= threshold for value in rms]
    # Fill very short gaps in the separated vocal stem to avoid syllable-sized flicker.
    max_gap = max(1, int(0.18 / 0.05))
    index = 0
    while index < len(active):
        if active[index]:
            index += 1
            continue
        end = index
        while end < len(active) and not active[end]:
            end += 1
        if index > 0 and end < len(active) and end - index <= max_gap:
            active[index:end] = [True] * (end - index)
        index = end
    ranges = []
    index = 0
    while index < len(active):
        if not active[index]:
            index += 1
            continue
        end = index + 1
        while end < len(active) and active[end]:
            end += 1
        start_seconds, end_seconds = index * 0.05, min(len(y) / sample_rate, end * 0.05)
        if end_seconds - start_seconds >= 0.12:
            ranges.append((start_seconds, end_seconds))
        index = end
    previous_end = None
    for start_seconds, end_seconds in ranges:
        if previous_end is not None and start_seconds - previous_end >= 0.35:
            make_event(events, "vocals", "vocal_pause", previous_end, "Demucs vocal-stem RMS activity threshold", end_seconds=start_seconds)
        make_event(events, "vocals", "vocal_activity_start", start_seconds, "Demucs vocal-stem RMS activity threshold", end_seconds=end_seconds)
        make_event(events, "vocals", "vocal_activity_end", end_seconds, "Demucs vocal-stem RMS activity threshold")
        previous_end = end_seconds


def detect_musical_events(stem_root: Path | None, sample_rate: int, energy: list, accents: list,
                          engine: dict, librosa, np, stems_reused: bool) -> dict:
    events = []
    groups = []
    status_by_source = {name: "unavailable" for name in STEM_NAMES}
    reason = None
    if stem_root is not None:
        loaded = {}
        import soundfile as sf
        for source in STEM_NAMES:
            stem_path = stem_root / f"{source}.wav"
            if not stem_path.is_file():
                continue
            try:
                samples, stem_rate = sf.read(str(stem_path), dtype="float32", always_2d=True)
                y = np.mean(samples, axis=1)
                status_by_source[source] = "available"
                loaded[source] = (y, int(stem_rate))
            except Exception as exc:
                reason = f"Could not read the {source} stem: {type(exc).__name__}."
        if "drums" in loaded:
            detect_onset_events(*loaded["drums"], "drums", "drum_hit", librosa, np, events)
        if "bass" in loaded:
            detect_onset_events(*loaded["bass"], "bass", "bass_attack", librosa, np, events)
        if "vocals" in loaded:
            vocal_y, vocal_rate = loaded["vocals"]
            detect_vocal_activity(vocal_y, vocal_rate, events, np)
            for event in detect_onset_events(vocal_y, vocal_rate, "vocals", "vocal_accent", librosa, np, events):
                event["category"] = "vocal_accent"
        if "other" in loaded:
            detect_onset_events(*loaded["other"], "other", "other_transient", librosa, np, events)
    else:
        reason = "Demucs stems were not available; only mix-level DSP remains."

    if accents:
        strengths = np.asarray([entry["strength"] for entry in accents], dtype=np.float32)
        threshold = float(np.quantile(strengths, 0.95)) if len(strengths) >= 20 else 1.01
        for accent in accents:
            if accent["strength"] >= threshold and threshold <= 1:
                make_event(events, "mix", "mix_impact", accent["time"], "Top 5% mix-level librosa onset strength", accent["strength"])
    for section in engine.get("sections", []):
        if section.get("start", 0) > 0:
            make_event(events, "mix", "section_change", float(section["start"]), "All-In-One-Infer section boundary")
    # Report sustained rises using neighboring two-second RMS windows; these are measurements, not mood labels.
    if len(energy) >= 9:
        for index in range(4, len(energy) - 4, 4):
            before = float(np.mean([point["value"] for point in energy[index - 4:index]]))
            after = float(np.mean([point["value"] for point in energy[index:index + 4]]))
            if after >= max(before * 1.35, before + 0.012):
                make_event(events, "mix", "energy_rise", energy[index]["time"], "Two-second RMS increase compared with preceding two seconds", min(1, after / max(before, 1e-5) / 3))

    beat_period = 60.0 / float(engine["bpm"]) if isinstance(engine.get("bpm"), (int, float)) and engine["bpm"] > 0 else 0.5
    for source in ("drums", "bass", "other"):
        if status_by_source[source] == "available":
            groups.extend(group_attacks(events, source, min(1.5, max(0.35, beat_period * 1.5))))
    counts = {source: sum(event["source"] == source for event in events) for source in ("drums", "bass", "vocals", "other", "mix")}
    available_count = sum(value == "available" for value in status_by_source.values())
    status = "available" if available_count == len(STEM_NAMES) else "partial" if available_count else "unavailable"
    events.sort(key=lambda event: (event["time"], event["source"], event["id"]))
    return {
        "status": status,
        "method": "All-In-One-Infer Demucs stems + librosa spectral-flux/RMS DSP",
        "stemsReused": stems_reused,
        "sources": status_by_source,
        "events": events,
        "groups": groups,
        "counts": counts,
        "instrumentRecognition": {
            "drumLabels": "kick_like/snare_like/hi_hat_like are conservative spectral-band heuristics, not a trained instrument classifier; drum_hit is unclassified.",
            "otherInstruments": "Not classified; other-stem events are instrument-agnostic transients.",
        },
        **({"reason": reason} if reason else {}),
    }
    try:
        import resource
        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return round(peak / (1024 * 1024 if sys.platform == "darwin" else 1024), 2)
    except Exception:
        return None


def main() -> int:
    if len(sys.argv) != 2:
        print("Expected one host-resolved audio path", file=sys.stderr)
        return 2
    audio_path = Path(sys.argv[1])
    started = time.perf_counter()
    stop_monitor = threading.Event()
    peak_memory = [0.0]
    def sample_memory() -> None:
        while not stop_monitor.is_set():
            value = process_peak_memory_mb()
            if value is not None:
                peak_memory[0] = max(peak_memory[0], value)
            stop_monitor.wait(0.25)
    monitor = threading.Thread(target=sample_memory, daemon=True)
    monitor.start()
    try:
        import numpy as np
        import soundfile as sf

        emit_progress("dsp", "Reading audio and measuring waveform, energy and accents…")
        samples, sample_rate = sf.read(str(audio_path), dtype="float32", always_2d=True)
        if samples.size == 0 or sample_rate <= 0:
            raise ValueError("The selected audio file is empty or invalid.")
        mono = np.mean(samples, axis=1)
        duration = float(len(mono) / sample_rate)
        # At most 2,000 samples for an interactive overview; preserve real peak
        # measurements rather than upscaling small inputs.
        bucket_count = min(2000, max(1, len(mono)))
        boundaries = np.linspace(0, len(mono), bucket_count + 1, dtype=np.int64)
        waveform = []
        for index in range(bucket_count):
            segment = mono[boundaries[index]:boundaries[index + 1]]
            waveform.append(float(np.max(np.abs(segment))) if len(segment) else 0.0)

        frame_seconds = 0.5
        frame_size = max(1, int(sample_rate * frame_seconds))
        energy = []
        for start in range(0, len(mono), frame_size):
            segment = mono[start:start + frame_size]
            rms = float(np.sqrt(np.mean(np.square(segment, dtype=np.float64)))) if len(segment) else 0.0
            energy.append({"time": round(start / sample_rate, 4), "value": round(rms, 6)})

        accents = []
        librosa_module = None
        dsp_error = None
        try:
            import librosa
            librosa_module = librosa
            resampled = librosa.resample(mono, orig_sr=sample_rate, target_sr=22050) if sample_rate != 22050 else mono
            onset_env = librosa.onset.onset_strength(y=resampled, sr=22050, hop_length=512)
            onset_frames = librosa.onset.onset_detect(onset_envelope=onset_env, sr=22050, hop_length=512, backtrack=False)
            values = onset_env[onset_frames] if len(onset_frames) else np.asarray([])
            peak = float(np.max(values)) if len(values) else 0.0
            for frame, value in zip(onset_frames, values):
                accents.append({"time": round(float(librosa.frames_to_time(frame, sr=22050, hop_length=512)), 4), "strength": round(float(value / peak), 4) if peak else 0.0})
        except Exception as exc:  # DSP energy remains usable without librosa onset support.
            dsp_error = f"Accent detection unavailable: {exc}"

        result = {
            "durationSeconds": round(duration, 4),
            "sampleRate": int(sample_rate),
            "channels": int(samples.shape[1]),
            "waveform": waveform,
            "energy": energy,
            "accents": accents,
            "dspError": dsp_error,
            "musicalEvents": {"status": "unavailable", "method": "No stem analysis completed.", "stemsReused": False,
                              "sources": {name: "unavailable" for name in STEM_NAMES}, "events": [], "groups": [],
                              "counts": {name: 0 for name in ("drums", "bass", "vocals", "other", "mix")},
                              "instrumentRecognition": {"drumLabels": "Unavailable", "otherInstruments": "Unavailable"},
                              "reason": "The separated stems are unavailable."},
            "engine": {"status": "unavailable", "reason": "All-In-One-Infer has not run."},
        }

        cache_root = os.environ.get("FLOXBOW_MUSIC_CACHE")
        stems_root = None
        stems_reused = False
        if cache_root:
            os.makedirs(cache_root, exist_ok=True)
            os.environ["TORCH_HOME"] = os.path.join(cache_root, "torch")
            os.environ["HF_HOME"] = os.path.join(cache_root, "huggingface")
            os.environ["XDG_CACHE_HOME"] = os.path.join(cache_root, "xdg")
            user_home = os.path.join(cache_root, "user-home")
            os.makedirs(user_home, exist_ok=True)
            os.environ["HOME"] = user_home
            os.environ["USERPROFILE"] = user_home
            source_sha256 = os.environ.get("FLOXBOW_MUSIC_SOURCE_SHA256", "")
            if len(source_sha256) == 64 and all(character in "0123456789abcdef" for character in source_sha256):
                demix_dir = Path(cache_root) / "stems" / source_sha256
                stem_track_dir = demix_dir / "htdemucs" / audio_path.stem
                stems_root = stem_track_dir
                required_stems = [stem_track_dir / f"{name}.wav" for name in STEM_NAMES]
                stems_reused = all(stem.is_file() for stem in required_stems)
                if stem_track_dir.exists() and not stems_reused:
                    shutil.rmtree(stem_track_dir, ignore_errors=True)
            else:
                demix_dir = Path(cache_root) / "stems" / "uncached"
                spec_dir = Path(cache_root) / "spec" / "uncached"
            spec_dir = Path(cache_root) / "spec" / (source_sha256 if len(source_sha256) == 64 else "uncached")
        else:
            demix_dir = Path.cwd() / ".music-analysis-demix"
            spec_dir = Path.cwd() / ".music-analysis-spec"

        try:
            import torch
            import allin1_infer

            requested_device = os.environ.get("FLOXBOW_MUSIC_DEVICE")
            device = requested_device if requested_device in {"cpu", "cuda"} else ("cuda" if torch.cuda.is_available() else "cpu")
            emit_progress("engine", f"Loading All-In-One-Infer on {device.upper()} (first use may download model files)…")
            with contextlib.redirect_stdout(sys.stderr):
                prediction = allin1_infer.analyze(str(audio_path), model="harmonix-all", device=device,
                                                  demix_dir=demix_dir, spec_dir=spec_dir,
                                                  keep_byproducts=True, skip_separation=stems_reused)
            result["engine"] = {
                "status": "available",
                "name": "All-In-One-Infer",
                "version": getattr(allin1_infer, "__version__", "3.1.0"),
                "device": device,
                "bpm": float(prediction.bpm) if prediction.bpm is not None else None,
                "beats": [float(value) for value in prediction.beats],
                "downbeats": [float(value) for value in prediction.downbeats],
                "beatPositions": [int(value) for value in prediction.beat_positions],
                "sections": [
                    {"start": float(segment.start), "end": float(segment.end), "label": str(segment.label)}
                    for segment in prediction.segments
                ],
            }
            expected_track = demix_dir / "htdemucs" / audio_path.stem
            if all((expected_track / f"{name}.wav").is_file() for name in STEM_NAMES):
                stems_root = expected_track
            else:
                stems_root = None
            # The spectrograms are only inference intermediates; keep the reusable audio stems only.
            shutil.rmtree(spec_dir, ignore_errors=True)
        except Exception as exc:
            if isinstance(exc, ModuleNotFoundError):
                reason = f"The analysis runtime is missing a required module: {exc.name}."
            elif isinstance(exc, PermissionError):
                reason = "The analysis runtime could not write its private model cache."
            elif "getaddrinfo" in str(exc).lower() or "urlopen error" in str(exc).lower():
                reason = "Model download failed because the network could not be reached. Retry when online."
            elif isinstance(exc, OSError):
                reason = f"The analysis engine could not load a required library: {str(exc).split(':')[0][:180]}"
            else:
                reason = f"{type(exc).__name__}: {str(exc)[:240]}"
            result["engine"] = {"status": "unavailable", "reason": reason}

        if librosa_module is not None:
            emit_progress("events", "Detecting percussive, bass, vocal and instrumental events from the separated stems…")
            try:
                result["musicalEvents"] = detect_musical_events(
                    stems_root, sample_rate, energy, accents, result["engine"], librosa_module, np, stems_reused,
                )
            except Exception as exc:
                result["musicalEvents"] = {
                    **result["musicalEvents"], "status": "partial",
                    "method": "All-In-One-Infer Demucs stems + librosa spectral-flux/RMS DSP",
                    "stemsReused": stems_reused,
                    "reason": f"Stem event detection failed: {type(exc).__name__}: {str(exc)[:240]}",
                }
        elif result["dspError"]:
            result["musicalEvents"]["reason"] = "librosa is unavailable; stem-specific event detection could not run."

        stop_monitor.set()
        monitor.join(timeout=1)
        result["performance"] = {
            "wallSeconds": round(time.perf_counter() - started, 2),
            "peakWorkingSetMB": round(max(peak_memory[0], process_peak_memory_mb() or 0), 2) or None,
        }
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
        return 0
    except Exception as exc:
        print(json.dumps({"error": f"{type(exc).__name__}: {exc}"}, ensure_ascii=False))
        traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
