"""Resize icons/logo-source.png into the PWA icon set."""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "icons" / "logo-source.png"
OUT = ROOT / "icons"
BG = (247, 247, 247, 255)


def square(src: Image.Image, size: int) -> Image.Image:
    return src.resize((size, size), Image.Resampling.LANCZOS)


def maskable(src: Image.Image, size: int, scale: float = 0.68) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), BG)
    inner = int(round(size * scale))
    logo = src.resize((inner, inner), Image.Resampling.LANCZOS)
    offset = (size - inner) // 2
    canvas.paste(logo, (offset, offset), logo)
    return canvas


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    square(src, 192).save(OUT / "icon-192.png", optimize=True)
    square(src, 512).save(OUT / "icon-512.png", optimize=True)
    square(src, 180).save(OUT / "apple-touch-icon.png", optimize=True)
    square(src, 32).save(OUT / "favicon-32.png", optimize=True)
    square(src, 16).save(OUT / "favicon-16.png", optimize=True)
    maskable(src, 512).save(OUT / "icon-512-maskable.png", optimize=True)
    maskable(src, 192).save(OUT / "icon-192-maskable.png", optimize=True)
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
