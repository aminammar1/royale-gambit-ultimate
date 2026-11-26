"""Fit the 3D Staunton renders to square chess squares.

The renders (apps/desktop/src/assets/pieces/staunton-*/, 180x230, MIT, James Clarke) carry wide
transparent margins and a faint baked shadow, so on a square they sat small and low. This crops
each to the piece (ignoring the faint shadow), then sets it in a square canvas: standing on the
bottom with a small margin, filling most of the height, centred. Rewrites the files in place;
running it twice changes nothing more.

    uv run --with pillow python scripts/fit_3d_pieces.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "apps/desktop/src/assets/pieces"
SIZE = 160  # square, px
HEIGHT = 0.98  # share of the square the tallest piece (the king) takes
BOTTOM = 0.02  # margin under the base


def piece_box(img: Image.Image) -> tuple[int, int, int, int]:
    """The piece's bounding box, ignoring the faint shadow (alpha below about a quarter)."""
    alpha = img.getchannel("A").point(lambda a: 255 if a > 64 else 0)
    box = alpha.getbbox()
    if box is None:
        raise ValueError("empty image")
    return box


def main() -> None:
    for folder in sorted(ROOT.glob("staunton-*")):
        files = sorted(folder.glob("*.png"))
        crops = {f: Image.open(f).convert("RGBA") for f in files}
        crops = {f: img.crop(piece_box(img)) for f, img in crops.items()}
        tallest = max(img.height for img in crops.values())
        scale = SIZE * HEIGHT / tallest  # one scale for the whole set keeps the sizes true
        for f, img in crops.items():
            w, h = round(img.width * scale), round(img.height * scale)
            piece = img.resize((w, h), Image.LANCZOS)
            canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
            canvas.alpha_composite(piece, ((SIZE - w) // 2, SIZE - h - round(SIZE * BOTTOM)))
            canvas.save(f, optimize=True)
        print(f"{folder.name}: {len(files)} pieces, {SIZE}px squares")


if __name__ == "__main__":
    main()
