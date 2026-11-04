"""Paint a panel livery onto the Q1 AO atlas. The mesh and bones stay the same."""
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
GLB = ROOT / "frontend" / "model" / "q1_ff.glb"
ORANGE_OUT = ROOT / "frontend" / "model" / "livery_orange.png"
ION_OUT = ROOT / "frontend" / "model" / "livery_ion.png"
ION_GLOW = ROOT / "frontend" / "model" / "livery_ion_glow.png"
MEDAL_OUT = ROOT / "frontend" / "model" / "livery_medal.png"

SHELL = {"head", "upperarm", "lowerarm", "upperleg", "lowerleg", "hip", "white", "white.001"}
CHEST = {"chest"}
BELLY = {"fabric"}
JOINT = {"black", "black.001", "rubber"}

WHITE = np.array([247, 248, 250], np.uint8)
ORANGE = np.array([255, 122, 26], np.uint8)
CHEST_COL = np.array([44, 48, 54], np.uint8)
JOINT_COL = np.array([58, 62, 68], np.uint8)
BELLY_COL = np.array([236, 239, 242], np.uint8)
ION_SHELL = np.array([16, 22, 34], np.uint8)
ION_LINE = np.array([90, 244, 255], np.uint8)
ION_CHEST = np.array([10, 14, 22], np.uint8)
ION_CORE = np.array([210, 255, 255], np.uint8)
ION_JOINT = np.array([18, 24, 36], np.uint8)
ION_BELLY = np.array([22, 30, 46], np.uint8)


def read_glb(path):
    data = path.read_bytes()
    json_len = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + json_len])
    bin_start = 20 + json_len
    bin_len = struct.unpack_from("<I", data, bin_start)[0]
    blob = data[bin_start + 8:bin_start + 8 + bin_len]
    return doc, blob


def accessor(doc, blob, index):
    acc = doc["accessors"][index]
    view = doc["bufferViews"][acc["bufferView"]]
    comp = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}[acc["componentType"]]
    width = struct.calcsize(comp)
    ncomp = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[acc["type"]]
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = view.get("byteStride", width * ncomp)
    count = acc["count"]
    out = np.empty((count, ncomp), np.float32)
    for i in range(count):
        off = start + i * stride
        out[i] = struct.unpack_from("<" + comp * ncomp, blob, off)
    return out


def raster_mask(uv, indices, height, width):
    mask = np.zeros((height, width), np.uint8)
    pts = np.empty_like(uv)
    pts[:, 0] = np.clip(uv[:, 0], 0, 1) * (width - 1)
    pts[:, 1] = np.clip(uv[:, 1], 0, 1) * (height - 1)
    tris = indices.reshape(-1, 3)
    for tri in tris:
        p = pts[tri]
        minx = max(int(np.floor(p[:, 0].min())), 0)
        maxx = min(int(np.ceil(p[:, 0].max())), width - 1)
        miny = max(int(np.floor(p[:, 1].min())), 0)
        maxy = min(int(np.ceil(p[:, 1].max())), height - 1)
        if maxx < minx or maxy < miny:
            continue
        xs = np.arange(minx, maxx + 1)
        ys = np.arange(miny, maxy + 1)
        gx, gy = np.meshgrid(xs, ys)
        v0, v1, v2 = p
        denom = (v1[1] - v2[1]) * (v0[0] - v2[0]) + (v2[0] - v1[0]) * (v0[1] - v2[1])
        if abs(denom) < 1e-8:
            continue
        w0 = ((v1[1] - v2[1]) * (gx - v2[0]) + (v2[0] - v1[0]) * (gy - v2[1])) / denom
        w1 = ((v2[1] - v0[1]) * (gx - v2[0]) + (v0[0] - v2[0]) * (gy - v2[1])) / denom
        w2 = 1 - w0 - w1
        mask[miny:maxy + 1, minx:maxx + 1] |= (w0 >= -0.01) & (w1 >= -0.01) & (w2 >= -0.01)
    return mask


def edge_distance(mask, steps=6):
    inside = mask.astype(bool)
    dist = np.zeros(mask.shape, np.uint8)
    for i in range(1, steps + 1):
        eroded = inside.copy()
        eroded[1:, :] &= inside[:-1, :]
        eroded[:-1, :] &= inside[1:, :]
        eroded[:, 1:] &= inside[:, :-1]
        eroded[:, :-1] &= inside[:, 1:]
        dist[inside & ~eroded] = i
        inside = eroded
    dist[inside] = steps + 1
    return dist


def chest_core(mask, dist, rim):
    core = np.zeros(mask.shape, bool)
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return core
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    cx0 = x0 + int((x1 - x0) * 0.44)
    cx1 = x0 + int((x1 - x0) * 0.56)
    core[y0:y1 + 1, cx0:cx1 + 1] = True
    return core & mask & (dist > rim)


def paint_orange(owned, ao):
    color = np.zeros((*ao.shape, 3), np.uint8)
    for code, fill, rim in (
        (1, WHITE, 4),
        (2, CHEST_COL, 5),
        (3, BELLY_COL, 3),
        (4, JOINT_COL, 2),
    ):
        mask = owned == code
        if not mask.any():
            continue
        dist = edge_distance(mask)
        color[mask] = fill
        color[mask & (dist <= rim)] = ORANGE
        if code == 1:
            color[mask & (dist > rim) & (ao < 78)] = ORANGE
    return color


def paint_ion(owned, ao):
    color = np.zeros((*ao.shape, 3), np.uint8)
    hot = np.zeros(ao.shape, np.uint8)
    for code, fill, rim in (
        (1, ION_SHELL, 6),
        (2, ION_CHEST, 7),
        (3, ION_BELLY, 4),
        (4, ION_JOINT, 3),
    ):
        mask = owned == code
        if not mask.any():
            continue
        dist = edge_distance(mask, steps=10)
        color[mask] = fill
        edge = mask & (dist <= rim)
        color[edge] = ION_LINE
        hot[edge] = 255
        if code == 1:
            groove = mask & (dist > rim) & (ao < 96)
            pin = mask & (dist >= rim + 3) & (dist <= rim + 4)
            color[groove | pin] = ION_LINE
            hot[groove | pin] = 180
        if code == 2:
            core = chest_core(mask, dist, rim)
            color[core] = ION_CORE
            hot[core] = 255
    glow = np.zeros_like(color)
    glow[hot > 0] = ION_LINE
    glow[hot == 255] = np.array([230, 255, 255], np.uint8)
    return color, glow


PAPER = np.array([243, 236, 223], np.uint8)
INDIGO = np.array([22, 58, 112], np.uint8)
PERSIMMON = np.array([212, 87, 42], np.uint8)
NAVY = np.array([26, 39, 68], np.uint8)
GOLD = np.array([232, 184, 92], np.uint8)
CREAM = np.array([247, 236, 214], np.uint8)
BRONZE = np.array([61, 52, 44], np.uint8)


def stamp_disk(color, mask, cx, cy, radius, rgb):
    y0 = max(int(cy - radius), 0)
    y1 = min(int(cy + radius) + 1, mask.shape[0])
    x0 = max(int(cx - radius), 0)
    x1 = min(int(cx + radius) + 1, mask.shape[1])
    if y1 <= y0 or x1 <= x0:
        return
    yy, xx = np.ogrid[y0:y1, x0:x1]
    hit = ((yy - cy) ** 2 + (xx - cx) ** 2 <= radius * radius) & mask[y0:y1, x0:x1]
    color[y0:y1, x0:x1][hit] = rgb


def stamp_diamond(color, mask, cx, cy, radius, rgb):
    y0 = max(int(cy - radius), 0)
    y1 = min(int(cy + radius) + 1, mask.shape[0])
    x0 = max(int(cx - radius), 0)
    x1 = min(int(cx + radius) + 1, mask.shape[1])
    if y1 <= y0 or x1 <= x0:
        return
    yy, xx = np.ogrid[y0:y1, x0:x1]
    hit = (np.abs(yy - cy) + np.abs(xx - cx) <= radius) & mask[y0:y1, x0:x1]
    color[y0:y1, x0:x1][hit] = rgb


def scatter(color, mask, step, radius, rgb, ox, oy):
    height, width = mask.shape
    for y in range(oy, height, step):
        for x in range(ox, width, step):
            stamp_disk(color, mask, x, y, radius, rgb)


LACQUER = np.array([48, 14, 24], np.uint8)
LACQUER_SOFT = np.array([92, 28, 40], np.uint8)
FAN_GOLD = np.array([232, 176, 64], np.uint8)
FAN_IVORY = np.array([255, 236, 204], np.uint8)


def islands(mask):
    from scipy import ndimage
    labels, count = ndimage.label(mask)
    found = []
    for index in range(1, count + 1):
        ys, xs = np.where(labels == index)
        if len(xs):
            found.append((xs, ys))
    return found


def stamp_fan(color, mask, cx, cy, radius, wedges):
    y0 = max(int(cy - radius), 0)
    y1 = min(int(cy + radius) + 1, mask.shape[0])
    x0 = max(int(cx - radius), 0)
    x1 = min(int(cx + radius) + 1, mask.shape[1])
    if y1 <= y0 or x1 <= x0:
        return
    yy, xx = np.ogrid[y0:y1, x0:x1]
    dx = xx - cx
    dy = yy - cy
    disk = (dx * dx + dy * dy <= radius * radius) & mask[y0:y1, x0:x1]
    angle = np.arctan2(dy, dx)
    slots = np.floor((angle + np.pi) / (2 * np.pi) * len(wedges)).astype(np.int32) % len(wedges)
    for index, rgb in enumerate(wedges):
        color[y0:y1, x0:x1][disk & (slots == index)] = rgb


def paint_fans(color, mask, min_area, fan_scale):
    wedges = (FAN_GOLD, FAN_IVORY, FAN_GOLD, FAN_IVORY, FAN_GOLD)
    for xs, ys in islands(mask):
        if len(xs) < min_area:
            continue
        span = min(int(xs.max() - xs.min()), int(ys.max() - ys.min()))
        radius = max(24, span * fan_scale)
        stamp_fan(color, mask, int(xs.mean()), int(ys.mean()), radius, wedges)


def paint_medal(owned, ao):
    color = np.zeros((*owned.shape, 3), np.uint8)
    color[owned == 1] = LACQUER
    color[owned == 2] = LACQUER
    color[owned == 3] = LACQUER_SOFT
    color[owned == 4] = np.array([36, 24, 22], np.uint8)
    paint_fans(color, owned == 1, 2800, 0.42)
    paint_fans(color, owned == 2, 800, 0.55)
    shade = (0.58 + 0.42 * (ao.astype(np.float32) / 255.0))[..., None]
    painted = owned > 0
    color[painted] = np.clip(color[painted].astype(np.float32) * shade[painted], 0, 255).astype(np.uint8)
    return color


def main():
    doc, blob = read_glb(GLB)
    image = doc["images"][0]
    view = doc["bufferViews"][image["bufferView"]]
    start = view.get("byteOffset", 0)
    ao = np.asarray(Image.open(
        __import__("io").BytesIO(blob[start:start + view["byteLength"]])
    ).convert("L"))
    height, width = ao.shape
    names = [mat["name"] for mat in doc["materials"]]
    owned = np.zeros((height, width), np.uint8)
    for mesh in doc["meshes"]:
        for prim in mesh["primitives"]:
            name = names[prim["material"]]
            if name not in SHELL | CHEST | BELLY | JOINT:
                continue
            uv = accessor(doc, blob, prim["attributes"]["TEXCOORD_0"])
            idx = accessor(doc, blob, prim["indices"]).astype(np.int64).reshape(-1)
            part = raster_mask(uv, idx, height, width)
            code = 1 if name in SHELL else 2 if name in CHEST else 3 if name in BELLY else 4
            owned[part.astype(bool)] = code
    Image.fromarray(paint_orange(owned, ao), "RGB").save(ORANGE_OUT, optimize=True)
    ion, glow = paint_ion(owned, ao)
    Image.fromarray(ion, "RGB").save(ION_OUT, optimize=True)
    Image.fromarray(glow, "RGB").save(ION_GLOW, optimize=True)
    Image.fromarray(paint_medal(owned, ao), "RGB").save(MEDAL_OUT, optimize=True)
    print(f"wrote {ORANGE_OUT.name}, {ION_OUT.name}, {ION_GLOW.name}, {MEDAL_OUT.name} {width}x{height}")


if __name__ == "__main__":
    main()
