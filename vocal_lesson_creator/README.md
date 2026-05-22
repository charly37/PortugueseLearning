# Vocal Lesson Creator

Combines MP3 files from the `sounds/` folder into a single audio lesson.

See **[docs/VOCAL_LESSON_CREATOR.md](../docs/VOCAL_LESSON_CREATOR.md)** for full documentation including setup, usage modes, and all options.

## Quick Start

```bash
# Install dependencies (once)
sudo apt-get install -y ffmpeg
pip install -r requirements.txt

# Build a lesson from challenge UUIDs
python combine_mp3.py --ids <uuid1> <uuid2> --lang fr --output my_lesson.mp3
```

Output is saved to `vocal_lesson_creator/output/`.
