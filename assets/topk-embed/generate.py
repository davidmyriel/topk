import os
OUT = os.path.dirname(os.path.abspath(__file__))
C, S, LG = 100, 115, 135  # cell, step, letter advance gap (matches topk-logo.svg)
ORANGE = "#FE5000"
GRAY = {"light": "#474747", "dark": "#EDEDED"}
G = {
 "T": ["#####", "..#..", "..#..", "..#..", "..#.."],
 "O": ["####", "#..#", "#..#", "#..#", "####"],
 "P": ["####", "#..#", "####", "#...", "#..."],
 "K": ["#..#", "#.#.", "##..", "#.#.", "#..#"],
 "E": ["####", "#...", "###.", "#...", "####"],
 "M": ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
 "B": ["###.", "#..#", "###.", "#..#", "###."],
 "D": ["###.", "#..#", "#..#", "#..#", "###."],
 "-": ["..", "..", "##", "..", ".."],
}
# embedding "vector": opacities per cell, reads as a dense vector column
VEC = [1.0, 0.35, 0.7, 0.2, 0.55]

def word(text, colors, x0=0, y0=0):
    rects, x = [], x0
    for ch, col in zip(text, colors):
        g = G[ch]
        for r, row in enumerate(g):
            for c, v in enumerate(row):
                if v == "#":
                    rects.append((x + c * S, y0 + r * S, col, 1.0))
        x += (len(g[0]) - 1) * S + C + (LG - C) + (S if ch == "-" or text[text.index(ch)+1:text.index(ch)+2] == "-" else 0)
    return rects, x - (LG - C)  # right edge

def svg(rects, w, h, name, scale):
    body = "\n".join(
        f'  <rect x="{x}" y="{y}" width="{C}" height="{C}" fill="{f}"'
        + (f' fill-opacity="{o}"' if o < 1 else "") + " />" for x, y, f, o in rects)
    s = (f'<svg width="{w*scale:g}" height="{h*scale:g}" viewBox="0 0 {w} {h}" fill="none" '
         f'xmlns="http://www.w3.org/2000/svg">\n{body}\n</svg>\n')
    open(os.path.join(OUT, name), "w").write(s)

for mode, gray in GRAY.items():
    # 1. horizontal lockup: TOPK-EMBED (mirrors "topk-embed-v1")
    r, w = word("TOPK-EMBED", [gray]*3 + [ORANGE] + [gray]*6)
    svg(r, w, 560, f"topk-embed-logo-{mode}.svg", 0.06)

    # 2. stacked lockup: TOPK over EMBED, EMBED at half scale, flush with TOPK width
    top, tw = word("TOPK", [gray]*3 + [ORANGE])
    bot, bw = word("EMBED", [gray]*5)
    k = tw / bw
    y = 560 + 180
    bot = [(round(x*k, 1), round(y + yy*k, 1), f, o) for x, yy, f, o in bot]
    # scaled rects need scaled size -> emit with transform group instead
    body_top = top
    s_rects = "\n".join(f'  <rect x="{x}" y="{yy}" width="{C}" height="{C}" fill="{f}" />' for x, yy, f, o in top)
    b_rects = "\n".join(f'    <rect x="{x}" y="{yy}" width="{C}" height="{C}" fill="{f}" />'
                        for x, yy, f, o in word("EMBED", [gray]*5)[0])
    h = round(y + 560 * k)
    open(os.path.join(OUT, f"topk-embed-logo-stacked-{mode}.svg"), "w").write(
        f'<svg width="{tw*0.06:g}" height="{h*0.06:g}" viewBox="0 0 {tw} {h}" fill="none" xmlns="http://www.w3.org/2000/svg">\n'
        f'{s_rects}\n  <g transform="translate(0 {y}) scale({k:.6f})">\n{b_rects}\n  </g>\n</svg>\n')

    # 3. mark: orange K + gray embedding-vector column
    rects = [(0, i*S, gray, VEC[i]) for i in range(5)]
    kr, kw = word("K", [ORANGE], x0=2 * S)
    rects += kr
    svg(rects, kw, 560, f"topk-embed-mark-{mode}.svg", 0.1)
print("ok")
