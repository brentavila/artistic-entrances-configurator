"""Group catalog photos into single and double doors.

The catalog has no owner-supplied single/double labels. This compares the
width of the door in the photo with its height. A wider unit is treated as a
double door. A few wide single doors, especially ones with sidelights, can
land in the double group until the list is reviewed by hand.
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "src" / "data" / "catalog.json"
THUMBS = ROOT / "public" / "media" / "doors" / "thumbnails"


def aspect_ratio(path: Path) -> float:
    image = np.asarray(Image.open(path).convert("L"), dtype=np.float32)
    corners = np.concatenate(
        [
            image[:20, :20].ravel(),
            image[:20, -20:].ravel(),
            image[-20:, :20].ravel(),
            image[-20:, -20:].ravel(),
        ]
    )
    mask = image < (float(np.median(corners)) - 28)
    ys, xs = np.where(mask)
    if len(xs) < 30:
        return 0.5
    return float((xs.max() - xs.min()) / (ys.max() - ys.min()))


def main() -> None:
    catalog = json.loads(CATALOG.read_text())
    counts = {"single": 0, "double": 0}
    for door in catalog["doors"]:
        image = THUMBS / f"{door['id']}.webp"
        layout = "double" if image.exists() and aspect_ratio(image) >= 0.60 else "single"
        door["layout"] = layout
        door["configuration"] = "Single door" if layout == "single" else "Double door"
        counts[layout] += 1
    CATALOG.write_text(json.dumps(catalog, indent=2) + "\n")
    print(counts)


if __name__ == "__main__":
    main()
