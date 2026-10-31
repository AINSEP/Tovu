#!/bin/bash
# contact-sheet.sh <video.mp4> [out.png] [fps]  — throttled 1-fps contact sheet to LOOK at every frame before calling a clip done.
IN=$1; OUT=${2:-${IN%.*}-sheet.png}; FPS=${3:-1}
nice -n 15 ffmpeg -v error -threads 2 -i "$IN" -filter_threads 1 -vf "fps=$FPS,scale=480:-1,tile=5x7:color=white" -frames:v 1 -y "$OUT" && echo "$OUT"
