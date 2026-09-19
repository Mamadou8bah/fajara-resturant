"""Generate Fajara PWA icons with the standard library only."""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "public"


def png_chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def write_png(path: Path, size: int, rgba_rows: list[bytes]) -> None:
    raw = b"".join(b"\x00" + row for row in rgba_rows)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    data = b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            png_chunk(b"IHDR", ihdr),
            png_chunk(b"IDAT", zlib.compress(raw, 9)),
            png_chunk(b"IEND", b""),
        ]
    )
    path.write_bytes(data)
    print(path.name, len(data))


def color(hex_color: str) -> tuple[int, int, int, int]:
    h = hex_color.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def fill_round_rect(pixels, size, x0, y0, w, h, radius, col):
    x1 = x0 + w
    y1 = y0 + h
    r2 = radius * radius
    for y in range(max(0, int(y0)), min(size, int(y1) + 1)):
        for x in range(max(0, int(x0)), min(size, int(x1) + 1)):
            lx = x - x0
            ly = y - y0
            if lx < 0 or ly < 0 or lx >= w or ly >= h:
                continue
            cx = min(lx, w - 1 - lx)
            cy = min(ly, h - 1 - ly)
            inside = True
            if radius > 0 and cx < radius and cy < radius:
                dx = radius - cx
                dy = radius - cy
                inside = (dx * dx + dy * dy) <= r2
            if inside:
                pixels[y][x] = col


def draw_icon(size: int, pad: bool = False) -> list[bytes]:
    bg = color("#271A11")
    terracotta = color("#C0613D")
    ink = color("#271A11")
    transparent = (0, 0, 0, 0)
    pixels = [[transparent for _ in range(size)] for _ in range(size)]
    scale = size / 512

    if pad:
        fill_round_rect(pixels, size, 0, 0, size, size, 0, bg)
        inset = 56
        ox = inset * scale
        ow = (512 - inset * 2) * scale
        fill_round_rect(pixels, size, ox, ox, ow, ow, 96 * scale * 0.78, bg)
        ix = (inset + 96) * scale
        iw = (512 - inset * 2 - 192) * scale
        fill_round_rect(pixels, size, ix, ix, iw, iw, 72 * scale * 0.78, terracotta)
        fx = (inset + 210) * scale
        fill_round_rect(pixels, size, fx, (inset + 170) * scale, 36 * scale, 232 * scale, 0, ink)
        fill_round_rect(pixels, size, fx, (inset + 170) * scale, 92 * scale, 36 * scale, 0, ink)
        fill_round_rect(pixels, size, fx, (inset + 254) * scale, 80 * scale, 36 * scale, 0, ink)
    else:
        fill_round_rect(pixels, size, 0, 0, size, size, 96 * scale, bg)
        fill_round_rect(
            pixels, size, 96 * scale, 96 * scale, 320 * scale, 320 * scale, 72 * scale, terracotta
        )
        fill_round_rect(pixels, size, 210 * scale, 170 * scale, 36 * scale, 232 * scale, 0, ink)
        fill_round_rect(pixels, size, 210 * scale, 170 * scale, 92 * scale, 36 * scale, 0, ink)
        fill_round_rect(pixels, size, 210 * scale, 254 * scale, 80 * scale, 36 * scale, 0, ink)

    return [bytes(b for px in row for b in px) for row in pixels]


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    write_png(ROOT / "icon-192.png", 192, draw_icon(192))
    write_png(ROOT / "icon-512.png", 512, draw_icon(512))
    write_png(ROOT / "apple-touch-icon.png", 180, draw_icon(180))
    write_png(ROOT / "icon-maskable-512.png", 512, draw_icon(512, pad=True))


if __name__ == "__main__":
    main()
