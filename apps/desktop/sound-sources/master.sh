#!/usr/bin/env bash
# Rebuilds src/assets/sounds/*.ogg. Each sound is two CC0 layers, as sound designers build them:
# the click of a real chess piece on a wooden board (el_boss, Freesound) for the attack, over the
# body of a wooden knock (Kenney's Impact Sounds) with its boom cut away. The mixes were fitted so
# their energy per band (under 300 Hz, 300-800, 0.8-2k, 2-5k, over 5k) lands within a few dB of
# the profile chess sites use, and each is set to their loudness: a move -32.5 LUFS, a capture and
# check -30.5, quiet and woody, never loud. A move uses one of five bodies and a capture one of
# four, so no two sound alike. Needs ffmpeg.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../src/assets/sounds"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
ff() { ffmpeg -v error -y "$@"; }
lp() { echo "lowpass=f=$1,lowpass=f=$1"; }
hp() { echo "highpass=f=$1,highpass=f=$1,highpass=f=$1"; }
body() { echo "$here/impactGeneric_light_00$1.ogg"; }

# level <in> <out.ogg> <LUFS>: sets the integrated loudness, then encodes.
level() {
  local now
  now=$(ffmpeg -hide_banner -i "$1" -af "apad=pad_dur=0.5,ebur128" -f null - 2>&1 | grep -E "^\s+I:" | tail -1 | awk '{print $2}')
  ff -i "$1" -af "volume=$(awk "BEGIN{print $3-($now)}")dB,alimiter=limit=0.5:level=disabled" -ac 1 -ar 48000 -c:a libvorbis -q:a 7 "$2"
}

# The move: a dark, short knock (click under 1.5 kHz, body above 200 Hz, nothing over 4.5 kHz).
move() {
  ff -i "$here/elboss-move.ogg" -i "$(body "$1")" -filter_complex \
    "[0]atrim=0:0.16,$(lp 1500),volume=4dB[c];[1]atrim=0:0.16,$(hp 200),volume=-3dB[b];[c][b]amix=inputs=2:normalize=0,lowpass=f=4500,lowpass=f=4500,lowpass=f=4500,afade=t=out:st=0.12:d=0.04" \
    -ac 1 -ar 48000 "$2"
}
# The capture: brighter, the clack of two pieces (click up to 7 kHz over the body).
capture() {
  ff -i "$here/elboss-capture.ogg" -i "$(body "$1")" -filter_complex \
    "[0]atrim=0:0.3,$(lp 7000),volume=-6dB[c];[1]atrim=0:0.3,$(hp 200)[b];[c][b]amix=inputs=2:normalize=0,afade=t=out:st=0.26:d=0.04" \
    -ac 1 -ar 48000 "$2"
}

rm -f "$out"/*.ogg
for i in 0 1 2 3 4; do
  move "$i" "$tmp/move$i.wav"
  level "$tmp/move$i.wav" "$out/move-$i.ogg" -32.5
done
n=0
for i in 3 0 1 4; do
  capture "$i" "$tmp/capture$n.wav"
  level "$tmp/capture$n.wav" "$out/capture-$n.ogg" -30.5
  n=$((n + 1))
done
# Check: the bright click over a light body, firmer than a move.
ff -i "$here/elboss-capture.ogg" -i "$(body 2)" -filter_complex \
  "[0]atrim=0:0.3,$(lp 7000)[c];[1]atrim=0:0.3,highpass=f=280,highpass=f=280,highpass=f=280,volume=-6dB[b];[c][b]amix=inputs=2:normalize=0,afade=t=out:st=0.26:d=0.04" \
  -ac 1 -ar 48000 "$tmp/check.wav"
level "$tmp/check.wav" "$out/check-0.ogg" -30.5
# Castling: the king, then the rook beside it a beat later, lighter.
ff -i "$tmp/move1.wav" -i "$tmp/move3.wav" -filter_complex "[1]volume=-2dB,adelay=110|110[r];[0][r]amix=inputs=2:normalize=0" "$tmp/castle.wav"
level "$tmp/castle.wav" "$out/castle-0.ogg" -31.5
# Promotion: the pawn set down, then the new piece's small higher tap.
ff -i "$tmp/move0.wav" -af "asetrate=48000*1.3,aresample=48000,volume=-6dB" "$tmp/tap.wav"
ff -i "$tmp/move4.wav" -i "$tmp/tap.wav" -filter_complex "[1]adelay=100|100[t];[0][t]amix=inputs=2:normalize=0" "$tmp/promote.wav"
level "$tmp/promote.wav" "$out/promote-0.ogg" -32
# A new board: the pieces set out, a quick run of knocks.
ff -i "$tmp/move0.wav" -i "$tmp/move1.wav" -i "$tmp/move2.wav" -i "$tmp/move3.wav" -i "$tmp/move4.wav" -filter_complex \
  "[1]volume=-2dB,adelay=55|55[b];[2]volume=-1dB,adelay=105|105[c];[3]volume=-3dB,adelay=150|150[d];[4]volume=-1dB,adelay=210|210[e];[0][b][c][d][e]amix=inputs=5:normalize=0" "$tmp/start.wav"
level "$tmp/start.wav" "$out/start-0.ogg" -31
