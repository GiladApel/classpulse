# Spike: lecture summary and lecturer report (field test T3)

- **Goal:** turn a recorded Hebrew lecture into a summary with correct chapter times, through the same upload path the app uses (Gemini Files API for large files).
- **What we did:** [`make-lecture.mts`](make-lecture.mts) generates an 88-second Hebrew lecture on Strategy vs. State with Gemini text-to-speech; `ffmpeg` turns it into an mp4. [`summarize.mts`](summarize.mts) runs the production `LectureSummarizer` and `LectureCoach` on it.
- **Run:**
  ```bash
  npx tsx spikes/lecture-summary/make-lecture.mts lecture.pcm
  ffmpeg -f s16le -ar 24000 -ac 1 -i lecture.pcm -f lavfi -i color=c=white:s=640x360 -shortest lecture.mp4
  npx tsx spikes/lecture-summary/summarize.mts lecture.mp4
  ```
- **Result** (2026-11-05, pilot): 12–17 s end to end; 4 chapters at 0:00 / 0:11 / 0:35 / 0:55, matching the audio; 5 sensible review questions.
- **Limits:** a full 75–90 minute lecture does not fit the free-tier quota. The pipeline itself has no length limit (2 GB in 50 MB chunks, Files API), so full lectures work subject to the API quota. A 5–10 minute real clip is still to be measured.
- **Decision:** the model takes the video directly, no separate speech-to-text ([ADR-004](../../docs/adr/ADR-004-llm.md)).
