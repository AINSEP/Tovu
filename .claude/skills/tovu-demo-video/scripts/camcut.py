#!/usr/bin/env python3
"""Virtual-camera re-cut of 1440x900 screen takes (adapted from handoffs/2026-09-15-tovu-fb-video-tooling/zoom-take.py).

usage: camcut.py spec.json            spec paths are relative to the spec file's folder
spec = {"out": "final/x-v2.mp4", "work": "work-v2",
        "views": {"FULL": [1, 720, 450], "COMPOSER": [2.3, 1250, 805], ...},   # zoom, centre x, centre y (1440x900 px)
        "segments": [{"src": "take1/take1-raw.webm", "a": 20.4, "b": 27.4, "speed": 1, "hold": 0,
                      "keys": [[0, "FULL"], [0.5, "COMPOSER", 0.9], ...],      # [local out t, view, ramp s (default 0.9)]
                      "join": "fade" | "wiperight" | "cut", "jd": 0.25}]}    # how this segment joins the PREVIOUS one
Each segment: trim -> speed -> 30 fps -> optional clone hold -> 2x lanczos upscale -> zoompan (smoothstep ramps,
crop clamped inside the frame) -> 1440x900. Segments render one at a time, then one pass joins them.
"""
import json, os, subprocess, sys
FPS, W, H = 30, 1440, 900
spec_path = os.path.abspath(sys.argv[1]); base = os.path.dirname(spec_path)
spec = json.load(open(spec_path)); views = spec["views"]
work = os.path.join(base, spec.get("work", "work-v2")); os.makedirs(work, exist_ok=True)
NICE = ["nice", "-n", "15", "ffmpeg", "-v", "error", "-threads", "2"]

def comp(keys, i):
    T = f"(in/{FPS})"
    v0 = views[keys[0][1]][i]; e = repr(float(v0)); prev = v0
    for k in keys[1:]:
        t0, v = k[0], views[k[1]][i]; r = k[2] if len(k) > 2 else 0.9
        d = v - prev; prev = v
        if d == 0: continue
        p = f"clip(({T}-{t0})/{r},0,1)"
        e += f"+({d})*{p}*{p}*(3-2*{p})"
    return e

def seg_filter(s):
    z = comp(s["keys"], 0); cx = comp(s["keys"], 1); cy = comp(s["keys"], 2)
    hold = f",tpad=stop_mode=clone:stop_duration={s['hold']}" if s.get("hold") else ""
    x = f"clip(2*({cx})-iw/zoom/2,0,iw-iw/zoom)"; y = f"clip(2*({cy})-ih/zoom/2,0,ih-ih/zoom)"
    # "drop": raw [t0, t1] ranges whose frames are removed (fps then repeats the previous frame), e.g. a render flash.
    drop = "".join(f",select='not(between(t,{d0},{d1}))'" for d0, d1 in s.get("drop", []))
    return (f"trim={s['a']}:{s['b']}{drop},setpts=(PTS-STARTPTS)/{s.get('speed', 1)},fps={FPS}{hold},"
            f"scale={2*W}:{2*H}:flags=lanczos,zoompan=z='{z}':x='{x}':y='{y}':d=1:s={W}x{H}:fps={FPS},"
            f"setsar=1,format=yuv420p")

def dur(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]))

only = set(sys.argv[2:])  # optional: re-render only these segment indexes
parts = []
for i, s in enumerate(spec["segments"]):
    p = os.path.join(work, f"seg{i:02d}.mp4"); parts.append(p)
    if only and str(i) not in only and os.path.exists(p): continue
    cmd = NICE + ["-i", os.path.join(base, s["src"]), "-filter_threads", "1", "-vf", seg_filter(s), "-an",
                  "-c:v", "libx264", "-preset", "medium", "-crf", "12", "-y", p]
    r = subprocess.run(cmd)
    if r.returncode: sys.exit(f"segment {i} failed")
lens = [dur(p) for p in parts]
# Join: chain xfade / concat, tracking where each segment starts in the output.
inputs, graph, label, t, starts = [], [], None, 0.0, []
for i, p in enumerate(parts):
    inputs += ["-i", p]; graph.append(f"[{i}:v]settb=1/{FPS}[i{i}]")
    s = spec["segments"][i]
    if label is None:
        label, t = f"i{i}", lens[i]; starts.append(0.0); continue
    j, jd = s.get("join", "cut"), s.get("jd", 0.25)
    out = f"j{i}"
    if j == "cut":
        graph.append(f"[{label}][i{i}]concat=n=2:v=1:a=0,settb=1/{FPS}[{out}]"); starts.append(t); t += lens[i]
    else:
        off = round(t - jd, 3)
        graph.append(f"[{label}][i{i}]xfade=transition={j}:duration={jd}:offset={off}[{out}]"); starts.append(off); t = off + lens[i]
    label = out
graph.append(f"[{label}]format=yuv420p[out]")
dst = os.path.join(base, spec["out"])
cmd = NICE + inputs + ["-filter_threads", "1", "-filter_complex_threads", "1", "-filter_complex", ";".join(graph),
                       "-map", "[out]", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
                       "-r", str(FPS), "-movflags", "+faststart", "-y", dst]
r = subprocess.run(cmd)
if r.returncode: sys.exit("join failed")
print("segment starts (output s):", [round(x, 2) for x in starts], "lens:", [round(x, 2) for x in lens])
print("duration", round(dur(dst), 2))
