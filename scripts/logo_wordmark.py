"""Set the logo's arched wordmark: the product is ROYALE GAMBIT, the original art says ROYALGAMBIT.

Takes assets/logo/logo-original.png (the transparent cut-out of design/newsprint/logo.jpg),
erases the old lettering around the queen and the board, sets the new name along the same arc in
Playfair Display Black with a silver gradient and an ink outline, then lays the queen's crown back
on top, as in the original. Writes apps/desktop/src/assets/logo.png.

    uv run --with pillow --with fonttools --with brotli python scripts/logo_wordmark.py
"""

import io
import math
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/logo/logo-original.png"
OUT = ROOT / "apps/desktop/src/assets/logo.png"
FONT = ROOT / "apps/desktop/node_modules/@fontsource/playfair-display/files/playfair-display-latin-900-normal.woff2"

WORD = "ROYALE GAMBIT"
SCALE = 4  # draw large, shrink at the end for clean edges


def font(size: int) -> ImageFont.FreeTypeFont:
    # Pillow reads TrueType, not WOFF2: unpack the font the app already ships.
    ttf = TTFont(FONT)
    ttf.flavor = None
    buffer = io.BytesIO()
    ttf.save(buffer)
    buffer.seek(0)
    return ImageFont.truetype(buffer, size)


def keep_mask(w: int, h: int) -> Image.Image:
    """The parts of the art that are not lettering: the crown and its ball, and the board."""
    s = w / 480
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse([(222 * s, 50 * s), (256 * s, 86 * s)], fill=255)  # the ball on the crown
    d.polygon([(183 * s, 92 * s), (298 * s, 92 * s), (300 * s, h), (180 * s, h)], fill=255)  # crown, body
    # The board's diamond below the lettering.
    d.polygon([(240 * s, 70 * s), (455 * s, 290 * s), (240 * s, h), (25 * s, 290 * s)], fill=255)
    d.rectangle([(0, 175 * s), (w, h)], fill=255)  # everything under the lettering band
    return mask


def letter(ch: str, f: ImageFont.FreeTypeFont, s: float, squeeze: float) -> Image.Image:
    """One glyph as the original art draws it: a light silver rim, a thin ink outline, and a dark
    chrome body with a bright band across the middle. Squeezed sideways: the art's letters are tall."""
    rim, ink = round(2.4 * s), round(1.2 * s)
    left, top, right, bottom = f.getbbox(ch, stroke_width=rim)
    pad = rim * 3
    size = (right - left + 2 * pad, bottom - top + 2 * pad)
    origin = (pad - left, pad - top)

    def mask(stroke: int) -> Image.Image:
        m = Image.new("L", size, 0)
        ImageDraw.Draw(m).text(origin, ch, font=f, fill=255, stroke_width=stroke, stroke_fill=255)
        return m

    body_top, body_bottom = pad - top + f.getbbox(ch)[1], pad - top + f.getbbox(ch)[3]
    grad = Image.new("RGBA", size)
    gd = ImageDraw.Draw(grad)
    for y in range(size[1]):
        t = min(1.0, max(0.0, (y - body_top) / max(1, body_bottom - body_top)))
        if t < 0.38:
            v = 70 + (200 - 70) * t / 0.38
        elif t < 0.55:
            v = 200 - (200 - 120) * (t - 0.38) / 0.17
        else:
            v = 120 - (120 - 28) * (t - 0.55) / 0.45
        gd.line([(0, y), (size[0], y)], fill=(int(v), int(v), int(v) + 3, 255))

    glyph = Image.new("RGBA", size, (0, 0, 0, 0))
    glyph.paste((0, 0, 0, 120), (round(s), round(2 * s)), mask(rim).filter(ImageFilter.GaussianBlur(1.5 * s)))
    glyph.paste((206, 206, 210, 255), (0, 0), mask(rim))
    glyph.paste((14, 14, 16, 255), (0, 0), mask(ink))
    glyph.paste(grad, (0, 0), mask(0))
    return glyph.resize((max(1, round(size[0] * squeeze)), size[1]), Image.LANCZOS)


def main() -> None:
    art = Image.open(SRC).convert("RGBA")
    w, h = art.size[0] * SCALE, art.size[1] * SCALE
    art = art.resize((w, h), Image.LANCZOS)
    s = w / 480

    keep = keep_mask(w, h)
    base = art.copy()
    base.putalpha(ImageChops.multiply(art.getchannel("A"), keep))
    crown = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    crown_mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(crown_mask).ellipse([(222 * s, 50 * s), (256 * s, 86 * s)], fill=255)
    ImageDraw.Draw(crown_mask).polygon([(183 * s, 92 * s), (298 * s, 92 * s), (298 * s, 175 * s), (183 * s, 175 * s)], fill=255)
    crown.paste(art, (0, 0), ImageChops.multiply(art.getchannel("A"), crown_mask))

    # The arc of the original lettering, on the 480 px art: centre (240, 418), radius 380.
    cx, cy, r = 240 * s, 432 * s, 390 * s
    squeeze = 0.72
    f = font(int(64 * s))
    gap = 1.0 * s
    # The space sits over the ball on the crown, so it is as wide as the ball and a margin.
    widths = [f.getlength(ch) * squeeze + gap if ch != " " else 44 * s for ch in WORD]
    total = sum(widths)
    angle = -math.pi / 2 - (total / r) / 2  # start so the word is centred on the crown

    text = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for ch, width in zip(WORD, widths):
        mid = angle + (width / 2) / r
        if ch != " ":
            g = letter(ch, f, s, squeeze).rotate(-math.degrees(mid + math.pi / 2), resample=Image.BICUBIC, expand=True)
            x = cx + r * math.cos(mid) - g.width / 2
            y = cy + r * math.sin(mid) - g.height / 2
            text.alpha_composite(g, (int(x), int(y)))
        angle += width / r

    out = Image.alpha_composite(Image.alpha_composite(base, text), crown)
    out = out.resize((w // SCALE, h // SCALE), Image.LANCZOS)
    out.save(OUT, optimize=True)
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
