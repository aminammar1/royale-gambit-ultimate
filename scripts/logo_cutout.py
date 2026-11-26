"""Cut Amine's logo (assets/logo/logo-update.png, drawn on solid black) out of its background.

The art is: black ground -> a soft white glow -> a bright silver rim -> the lettering, board and
queen. The ground is the near-black reachable from the image border, plus the glow band beside it.
There, the glow is white laid over black, so it becomes white at alpha = brightness and reads the
same on paper (Day) and on dark grey (Night). Inside the rim nothing changes.
Crops to the art, shrinks to 640 px wide and writes apps/desktop/src/assets/logo.png.

    uv run --with pillow --with numpy --with scipy python scripts/logo_cutout.py
"""

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/logo/logo-update.png"
OUT = ROOT / "apps/desktop/src/assets/logo.png"
WIDTH = 640  # twice the largest size the app draws it (w-40 = 160 css px on a 2x screen, start card)
BLACK = 25  # brightest pixel still counted as the black ground
RIM = 150  # brightness at which the glow has turned into the rim
GLOW = 14  # widest the glow gets, in source pixels


def main() -> None:
    rgb = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float32)
    lum = rgb.max(axis=2)

    # The black ground: near-black pixels connected to the border. The queen's rim has gaps, so
    # the glow is not flooded: it is only the band of not-yet-rim pixels next to the black.
    labels, _ = ndimage.label(lum < BLACK)
    border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    black = np.isin(labels, border[border != 0])
    near = ndimage.distance_transform_edt(~black) <= GLOW
    ground = black | (near & (lum < RIM))

    alpha = np.where(ground, lum / 255.0, 1.0)
    alpha[ground & (lum < 6)] = 0.0  # the black is not perfectly 0: no faint smudge on paper
    color = np.where(ground[..., None], 255.0, rgb)  # glow is white; the art keeps its colours

    rgba = np.dstack([color, alpha * 255.0]).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(rgba, "RGBA")
    img = img.crop(img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox())
    height = round(img.height * WIDTH / img.width)
    img.resize((WIDTH, height), Image.LANCZOS).save(OUT, optimize=True)
    print(f"wrote {OUT.relative_to(ROOT)} {WIDTH}x{height}")


if __name__ == "__main__":
    main()
