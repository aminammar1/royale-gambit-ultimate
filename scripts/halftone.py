"""Turn the champion photos into small halftone WebP portraits for the desktop app (DESIGN.md).

Fill assets/wc-pictures/champions.json first: map each photo file to its champion number
(1 Steinitz ... 16 Carlsen, as in apps/desktop/src/app/champions.ts), or leave null to skip.

    uv run --with pillow python scripts/halftone.py
"""

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "wc-pictures"
OUT = ROOT / "apps" / "desktop" / "src" / "assets" / "champions"
SIZE = 160  # output pixels (shown at 64-80 CSS px, so it stays sharp on 2x screens)
CELL = 4  # halftone cell in pixels
INK, PAPER = (27, 26, 23), (243, 239, 230)


def halftone(photo: Image.Image) -> Image.Image:
    gray = ImageOps.autocontrast(ImageOps.fit(photo.convert("L"), (SIZE, SIZE)), cutoff=1)
    out = Image.new("RGB", (SIZE * 2, SIZE * 2), PAPER)  # draw at 2x, then downsample
    draw = ImageDraw.Draw(out)
    for y in range(0, SIZE, CELL):
        for x in range(0, SIZE, CELL):
            box = gray.crop((x, y, x + CELL, y + CELL))
            darkness = 1 - sum(box.getdata()) / (CELL * CELL * 255)
            r = CELL * math.sqrt(darkness) * 0.75  # area follows darkness
            cx, cy = (x + CELL / 2) * 2, (y + CELL / 2) * 2
            draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=INK)
    return out.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def main() -> None:
    mapping: dict[str, int | None] = json.loads((SRC / "champions.json").read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    for name, number in mapping.items():
        if number is None:
            continue
        target = OUT / f"{number:02d}.webp"
        halftone(Image.open(SRC / name)).save(target, quality=85)
        print(f"{name} -> {target.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
