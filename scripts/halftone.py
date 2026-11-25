"""Turn the champion photos into small halftone WebP portraits for the desktop app (DESIGN.md).

Fill assets/wc-pictures/champions.json first: map each photo file to its champion number
(1 Steinitz ... 18 Gukesh, as in apps/desktop/src/app/champions.ts), or leave null to skip.
A number alone crops the centre; {"no": 17, "focus": [0.49, 0.3], "size": 0.6} crops a square
of `size` x the photo's short side around the face at `focus` (fractions of width and height).

By default the output is a grey photo crop: at the nav's 64 px a face has to be recognisable,
and dots that small lose it. `--halftone` writes an alpha mask of dots instead (for the large,
faint masthead portraits), which the app paints with the edition's ink through `mask-image`.

    uv run --with pillow python scripts/halftone.py [--halftone]
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
INK = (27, 26, 23)


def crop(photo: Image.Image, focus: tuple[float, float] | None, size: float | None) -> Image.Image:
    if focus is None:
        return ImageOps.fit(photo, (SIZE, SIZE))
    side = min(photo.width, photo.height) * (size or 1.0)
    cx, cy = focus[0] * photo.width, focus[1] * photo.height
    left = min(max(cx - side / 2, 0), photo.width - side)
    top = min(max(cy - side / 2, 0), photo.height - side)
    return photo.crop((round(left), round(top), round(left + side), round(top + side))).resize((SIZE, SIZE))


def halftone(photo: Image.Image, focus=None, size=None) -> Image.Image:
    gray = ImageOps.autocontrast(crop(ImageOps.exif_transpose(photo).convert("L"), focus, size), cutoff=1)
    mask = Image.new("L", (SIZE * 2, SIZE * 2), 0)  # draw at 2x, then downsample
    draw = ImageDraw.Draw(mask)
    for y in range(0, SIZE, CELL):
        for x in range(0, SIZE, CELL):
            box = gray.crop((x, y, x + CELL, y + CELL))
            darkness = 1 - sum(box.getdata()) / (CELL * CELL * 255)
            r = CELL * math.sqrt(darkness) * 0.75  # area follows darkness
            cx, cy = (x + CELL / 2) * 2, (y + CELL / 2) * 2
            draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    alpha = mask.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (SIZE, SIZE), INK + (0,))
    out.putalpha(alpha)
    return out


def photo(picture: Image.Image, focus=None, size=None) -> Image.Image:
    gray = crop(ImageOps.exif_transpose(picture).convert("L"), focus, size)
    return ImageOps.autocontrast(gray, cutoff=1)


def main() -> None:
    import sys

    make = halftone if "--halftone" in sys.argv else photo
    mapping: dict[str, int | dict | None] = json.loads((SRC / "champions.json").read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    for name, entry in mapping.items():
        if entry is None:
            continue
        spec = entry if isinstance(entry, dict) else {"no": entry}
        target = OUT / f"{spec['no']:02d}.webp"
        portrait = make(Image.open(SRC / name), spec.get("focus"), spec.get("size"))
        portrait.save(target, quality=82)
        print(f"{name} -> {target.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
