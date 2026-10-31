---
name: tovu-demo-video
description: Make a Tovu demo / marketing video clip (screen recording of the real admin chat + site, edited with a follow-the-action zoom camera, captions, ~30 s) or a reel built from clips. Use when asked to record, re-record, edit, or compile a demo video, a feature clip, a YouTube/site reel, or a Short.
---

# Tovu demo videos

The owner judges clips against the approved references in tovu-dev Media: `demo-v1-contact-page-zoom`
and `higgsfield-v3`. A clip that is a static full-screen recording, or that hides the work, gets rejected
("awful… no videography"). Every rule below came from a rejected clip.

## 1. Plan before recording (write it in the clip's NOTES.md)
- **Story = beats the viewer must SEE**, each held ≥ 1.5 s at readable zoom:
  1. the prompt being typed, 2. the chat working (the specific tools/plugins it calls),
  3. the result arriving where a user would see it (Media grid, Posts list, the chat),
  4. the final placement (public page/article/chart). Never squash minutes of work into a 3 s blur.
- **Ask from the page where the result lands.** Split big asks into prompts asked from each page
  (e.g. image from Media, then article from Posts) so both results land on camera.
- Pick a prompt that makes something visually striking; do a **dry run** (unrecorded chat) first.
- Target ~30 s per feature clip (25–45 s), no dead time. Reel = clips + motion-graphics cards.

## 2. Where to record
- Default site: `fake-test-site` on its own ports (3002/5175/4321). Use tovu-dev (:3000) only when the
  owner says so (e.g. Higgsfield is connected there). Never restart/rebuild/edit anything serving :3000.
- Start test stacks from a clone that is NOT the one serving :3000 (saving files there restarts the
  owner's site). Exact commands, auth (local owner sign-in → storage state), and env traps:
  `references/stack-and-edit.md`. Set `TOVU_SITE_DIR` and `TOVU_PUBLIC_URL=https://localhost:3002`.
- Before every recorded admin shot: **collapse the admin sidebar** (the `‹ ›` toggle) so no site
  name shows; dismiss the "change your password" banner; set chat Tool calls to **Show** (restore the
  owner's setting after); prefer Claude for the chat so the Gemini full-access note isn't on camera
  (restore the owner's agent afterwards).
- Leftovers from dry runs bias retakes (the assistant reuses them). Move them to **Trash** (restorable),
  never empty Trash, never hard-delete.

## 3. Recording
- Playwright `recordVideo` 1440x900, headless, driving the REAL admin chat (no mocks).
  Template: `scripts/take-example.mjs` (two-prompt take with events/timeline logging);
  storage state: `scripts/make-state.mjs`.
- No `page.screenshot()` while recording (causes shimmer). Scroll with `scrollTo` in even steps every
  ~40 ms. Type with `pressSequentially` (~35 ms). Wait out entrance animations (~700 ms).
- Log element boxes + chat-text change times to `events.json` / `timeline.json` so the edit cuts on
  real moments.
- Paid generations (Higgsfield etc.): ≤ 2–4 per clip; say how many you used.

## 4. Editing — the virtual camera (mandatory)
Read `references/camera-reference.md` (per-second framings of the approved references). In short:
wide only as 0.5–1 s openers or short context beats; ~2.3x on the composer while typing; ~1.8x
following the chat rows as they append; 1.6–1.8x on the result; smoothstep moves of ~0.8–1 s.
- Renderer: `scripts/camcut.py spec.json` (segments with trim/speed/hold + keyframed zoom views,
  2x lanczos upscale before zoompan, joins by cut/fade/wipe). Example spec:
  `scripts/camcut-spec-example.json`.
- Every ffmpeg/python media command: `nice -n 15`, `-threads 2`, `-filter_threads 1`, one at a time,
  never while a take is recording; wait if `uptime` load > 12 (unthrottled ffmpeg froze the Mac).
- Output 1440x900 (or 1920x1080 for reels) 30 fps h264 yuv420p `+faststart`; clips ship without audio.
- `captions.json`: 3–6 captions ≤ 6 words, plain verbs, no exclamation marks.
- Audio (reels): music ~12–15 dB under any voice; measure with `ffmpeg -af ebur128` — I can't hear.

## 5. Before saying "done"
- `scripts/contact-sheet.sh final.mp4` and LOOK at every frame next to the reference's sheet:
  text readable in most frames, every story beat present, no site name, no error toasts.
- ffprobe the duration. Report the product flaws that are on camera (red failed rows, wrong brand,
  missing in-chat image) instead of hiding them.
- Upload finished clips to tovu-dev Media (Media → Upload image → file input → alt
  "Tovu demo: …"); keep superseded versions until the owner says delete.
- Kill every process you started; close your Chrome tab.

## Coordinating video agents
- One recording at a time on the machine; editing waits while a take records.
- Mid-run messages to a running subagent often don't land — put every rule in the dispatch prompt;
  restart fresh for scope changes.
