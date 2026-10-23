#!/usr/bin/env bash
# build_video.sh — รวมเสียง (VO ไทย + ดนตรี) แล้ว encode เฟรม → MP4 1920x1080 30fps
set -e
cd "$(dirname "$0")"

VO1=out/vo/vo1.mp3; VO2=out/vo/vo2.mp3; VO3=out/vo/vo3.mp3; VO4=out/vo/vo4.mp3
# จุดเริ่ม VO (วินาที) ให้ตรงกับฉาก: S1=0.35 · S2=8.20 · S4=25.00 · S5=31.00
A1=350; A2=8200; A3=25000; A4=31000

echo "== mix audio =="
ffmpeg -y -v error \
  -i "$VO1" -i "$VO2" -i "$VO3" -i "$VO4" -i out/music.m4a \
  -filter_complex "\
[0:a]adelay=${A1}|${A1},volume=1.0[v1];\
[1:a]adelay=${A2}|${A2},volume=1.0[v2];\
[2:a]adelay=${A3}|${A3},volume=1.0[v3];\
[3:a]adelay=${A4}|${A4},volume=1.0[v4];\
[v1][v2][v3][v4]amix=inputs=4:normalize=0:dropout_transition=0[vo];\
[4:a]volume=0.13,atrim=0:39[mus];\
[vo][mus]amix=inputs=2:normalize=0:dropout_transition=0,alimiter=limit=0.95[a]" \
  -map "[a]" -t 39 -c:a aac -b:a 192k -ar 48000 out/audio.m4a
ffprobe -v error -show_entries format=duration -of csv=p=0 out/audio.m4a

echo "== encode video =="
ffmpeg -y -v error -framerate 30 -i out/frames/f%05d.jpg -i out/audio.m4a \
  -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p -profile:v high -level 4.1 \
  -c:a aac -b:a 192k -shortest -movflags +faststart \
  "AI_Insurance_Network_Tree_Launch_16x9.mp4"
ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_name,width,height,r_frame_rate -of default=noprint_wrappers=1 "AI_Insurance_Network_Tree_Launch_16x9.mp4"
