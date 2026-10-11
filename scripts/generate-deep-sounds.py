#!/usr/bin/env python3
"""Generate original short 70–140 Hz UI tones as Android OGG resources.
Requires Python 3 and ffmpeg with libvorbis support.
"""
import math
import os
import struct
import subprocess
import tempfile
import wave

RATE = 44_100
EFFECTS = {
    "tap": (112, 0.075),
    "select": (136, 0.105),
    "toggle": (96, 0.145),
    "adjust": (120, 0.060),
    "open": (88, 0.205),
    "confirm": (132, 0.265),
    "error": (72, 0.170),
    "notify": (108, 0.320),
}
OUTPUT = os.path.join(os.path.dirname(__file__), "../android/app/src/main/res/raw")


def main() -> None:
    os.makedirs(OUTPUT, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="hyperlink-deep-") as tmp:
        for name, (frequency, duration) in EFFECTS.items():
            source = os.path.join(tmp, f"{name}.wav")
            count = int(RATE * duration)
            with wave.open(source, "wb") as audio:
                audio.setnchannels(1)
                audio.setsampwidth(2)
                audio.setframerate(RATE)
                frames = []
                for index in range(count):
                    time = index / RATE
                    attack = min(1.0, time / 0.004)
                    decay = math.exp(-time / (duration * 0.52))
                    tone = (
                        math.sin(2 * math.pi * frequency * time)
                        + 0.28 * math.sin(2 * math.pi * frequency * 2 * time)
                        + 0.10 * math.sin(2 * math.pi * frequency * 3 * time)
                    )
                    transient = 0.16 * math.exp(-time / 0.006) * math.sin(2 * math.pi * 1500 * time)
                    sample = max(-1.0, min(1.0, 0.72 * attack * decay * tone / 1.38 + transient))
                    frames.append(struct.pack("<h", int(sample * 32767)))
                audio.writeframes(b"".join(frames))
            target = os.path.join(OUTPUT, f"deep_{name}.ogg")
            subprocess.run(
                ["ffmpeg", "-loglevel", "error", "-y", "-i", source, "-c:a", "libvorbis", "-q:a", "4", target],
                check=True,
            )
            print(f"{target}: {frequency} Hz fundamental, {duration:.3f} s")


if __name__ == "__main__":
    main()
