#!/usr/bin/env bash
# Rebuilds src/assets/sounds/*.ogg from the CC0 recordings here (el_boss, see CREDITS.md there).
# A recording alone is a thin click; each knock gets a warm wooden body: rumble cut, 260 Hz
# lifted, the click above 3 kHz softened, a short 95-135 Hz thump layered under, levels matched.
# Check, castle and promote are built from the move knock. Needs ffmpeg. Run from anywhere.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../src/assets/sounds"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
ff() { ffmpeg -v error -y "$@"; }

ff -f lavfi -i "aevalsrc=0.55*sin(2*PI*(95*t+40*0.02*(1-exp(-t/0.02))))*exp(-t*38)*(1-exp(-t*900)):s=48000:d=0.14" "$tmp/body.wav"
ff -i "$here/move.ogg" -af "highpass=f=90,equalizer=f=260:t=o:w=1.2:g=8,equalizer=f=3200:t=o:w=1.5:g=-6,lowpass=f=4200,afade=t=out:st=0.13:d=0.05,volume=10dB" -ac 1 -ar 48000 "$tmp/knock.wav"
ff -i "$tmp/knock.wav" -i "$tmp/body.wav" -filter_complex "[0][1]amix=inputs=2:normalize=0,alimiter=limit=0.7" "$tmp/move.wav"
ff -i "$here/capture.ogg" -af "highpass=f=90,equalizer=f=300:t=o:w=1.2:g=6,equalizer=f=3600:t=o:w=1.5:g=-5,lowpass=f=5500,afade=t=out:st=0.2:d=0.05,volume=2.3dB" -ac 1 -ar 48000 "$tmp/take.wav"
ff -i "$tmp/take.wav" -i "$tmp/body.wav" -filter_complex "[1]volume=-2dB[b];[0][b]amix=inputs=2:normalize=0,alimiter=limit=0.8" "$tmp/capture.wav"
# The rook a beat after the king, a touch higher; the promoted piece a small high tap.
ff -i "$tmp/move.wav" -af "asetrate=48000*1.07,aresample=48000,volume=-3dB" "$tmp/rook.wav"
ff -i "$tmp/move.wav" -af "asetrate=48000*1.3,aresample=48000,highpass=f=400,volume=-5dB" "$tmp/tick.wav"
ff -i "$tmp/move.wav" -af "equalizer=f=1800:t=o:w=1:g=4,volume=1.5dB,alimiter=limit=0.85" "$tmp/check.wav"
ff -i "$tmp/move.wav" -i "$tmp/rook.wav" -filter_complex "[1]adelay=110|110[r];[0][r]amix=inputs=2:normalize=0" "$tmp/castle.wav"
ff -i "$tmp/move.wav" -i "$tmp/tick.wav" -filter_complex "[1]adelay=95|95[t];[0][t]amix=inputs=2:normalize=0" "$tmp/promote.wav"
ff -i "$here/start.ogg" -af "highpass=f=90,equalizer=f=280:t=o:w=1.2:g=6,equalizer=f=3400:t=o:w=1.5:g=-5,lowpass=f=5000,volume=3dB" -ac 1 -ar 48000 "$tmp/start.wav"

# Matched loudness: each near -21.5 dB mean, check a little firmer.
for pair in move:-6.5 capture:-3.5 check:-6.5 castle:-6.5 promote:-6 start:2; do
  name="${pair%%:*}" gain="${pair##*:}"
  ff -i "$tmp/$name.wav" -af "volume=${gain}dB" -ac 1 -ar 48000 -c:a libvorbis -q:a 6 "$out/$name.ogg"
done
