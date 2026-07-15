#!/usr/bin/env python3

import json
import sys

import mlx_whisper


def align(request):
    result = mlx_whisper.transcribe(
        request["audioPath"],
        path_or_hf_repo=request["model"],
        language="en",
        word_timestamps=True,
        verbose=None,
        condition_on_previous_text=False,
        temperature=0.0,
    )
    words = []
    for segment in result.get("segments", []):
        for word in segment.get("words", []):
            words.append(
                {
                    "text": word["word"],
                    "start": word["start"],
                    "end": word["end"],
                    "probability": word.get("probability"),
                }
            )
    duration_seconds = max(
        [segment.get("end", 0) for segment in result.get("segments", [])] + [0]
    )
    return {
        "ok": True,
        "words": words,
        "durationSeconds": duration_seconds,
    }


for line in sys.stdin:
    try:
        request = json.loads(line)
        response = align(request)
    except Exception as error:
        response = {"ok": False, "error": str(error)}
    print(json.dumps(response, ensure_ascii=True), flush=True)
