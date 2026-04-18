"""Generate placeholder icon PNGs for the Stream Deck plugin.

Stream Deck requires icons at specific resolutions. Filenames use the
naming convention `<name>.png` and `<name>@2x.png` for retina variants.
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

BASE = Path("com.speroautem.claude-usage.sdPlugin/imgs")

# Claude-ish orange/tan palette
BG = (212, 122, 75)      # warm terracotta
FG = (255, 255, 255)     # white


def make_icon(path: Path, size: int, text: str = "C") -> None:
    img = Image.new("RGBA", (size, size), BG + (255,))
    draw = ImageDraw.Draw(img)
    # Try to draw a simple letter centered
    try:
        font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            int(size * 0.55),
        )
    except Exception:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    draw.text(
        ((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]),
        text,
        fill=FG,
        font=font,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)


# Required images per manifest references.
# Stream Deck auto-picks @2x variant on retina displays.
targets = [
    # Plugin-level
    ("plugin/marketplace.png", 72),
    ("plugin/marketplace@2x.png", 144),
    ("plugin/category-icon.png", 28),
    ("plugin/category-icon@2x.png", 56),
    # Action-level (key + action-list icon)
    ("actions/usage/icon.png", 20),
    ("actions/usage/icon@2x.png", 40),
    ("actions/usage/key.png", 72),
    ("actions/usage/key@2x.png", 144),
]

for rel, size in targets:
    make_icon(BASE / rel, size)
    print(f"  {rel} ({size}x{size})")

print("Done.")
