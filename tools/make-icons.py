#!/usr/bin/env python3
"""Render the Hiring Signals icon (teal rounded square, three rising bars, signal dot)
at 16/32/48/128 px with no third-party deps (stdlib zlib PNG writer, 8x supersampling)."""
import os, struct, zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
BG = (15, 123, 108)      # #0f7b6c
FG = (255, 255, 255)
DOT = (255, 196, 61)     # amber "signal"


def inside_rrect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def shade(u, v):
    """u, v in [0,1). Returns RGBA for the logical icon."""
    if not inside_rrect(u, v, 0.0, 0.0, 1.0, 1.0, 0.22):
        return None
    # three bars, bottom aligned
    base = 0.80
    bars = [(0.20, 0.34, 0.56), (0.42, 0.56, 0.42), (0.64, 0.78, 0.26)]
    for x0, x1, top in bars:
        if inside_rrect(u, v, x0, top, x1, base, 0.035):
            return FG
    # signal dot above the tallest bar
    if (u - 0.71) ** 2 + (v - 0.14) ** 2 <= 0.075 ** 2:
        return DOT
    return BG


def render(size, ss=8, pad=0.0):
    rows = []
    n = ss * ss
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            r = g = b = a = 0
            for sy in range(ss):
                for sx in range(ss):
                    u = ((px + (sx + 0.5) / ss) / size - pad) / (1 - 2 * pad)
                    v = ((py + (sy + 0.5) / ss) / size - pad) / (1 - 2 * pad)
                    c = shade(u, v)
                    if c:
                        r += c[0]; g += c[1]; b += c[2]; a += 1
            if a:
                row += bytes([r // a, g // a, b // a, round(255 * a / n)])
            else:
                row += b'\x00\x00\x00\x00'
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for s in (16, 32, 48, 128):
        p = os.path.join(OUT, f'icon{s}.png')
        with open(p, 'wb') as f:
            # Web Store guidance: 128px icon = 96px artwork + 16px transparent padding.
            f.write(render(s, pad=16 / 128 if s == 128 else 0.0))
        print('wrote', os.path.normpath(p))
