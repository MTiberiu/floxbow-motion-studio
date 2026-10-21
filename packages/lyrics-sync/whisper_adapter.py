"""Local optional Whisper worker. Runs outside Electron; requires openai-whisper + FFmpeg."""
import argparse
import json
import os
import whisper

parser = argparse.ArgumentParser()
parser.add_argument("audio")
parser.add_argument("output")
parser.add_argument("--model", default="base")
args = parser.parse_args()
# Require an existing model; never silently start multi-GB model downloads.
model_path = os.path.expanduser(f"~/.cache/whisper/{args.model}.pt")
if not os.path.isfile(model_path):
    raise RuntimeError(f"Cached model missing: {model_path}. Install this model explicitly first.")
model = whisper.load_model(model_path)
result = model.transcribe(args.audio, word_timestamps=True, verbose=False, fp16=False)
with open(args.output, "w", encoding="utf-8") as file:
    json.dump(result, file, ensure_ascii=False, indent=2)
