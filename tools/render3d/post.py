# 3D 渲染工作站後製：裁透明邊 → 留邊 → 縮到指定長邊 → webp(q85, 保留 alpha)
# group：同組共用一個裁切框（大小比例一致）；kind=card：底色＋白色內框＋中間 3D 圖示合成卡背
# 用法：python post.py <manifest.json>（由 render.js 產生）
import sys, json, os, math
from PIL import Image, ImageDraw, ImageFilter

man = json.load(open(sys.argv[1], encoding='utf-8'))
RAW, OUT = man['raw'], man['out']
JOBS = {j['name']: j for j in man['jobs']}


def load(name):
    return Image.open(os.path.join(RAW, name + '.png')).convert('RGBA')


def abox(im):  # 不透明範圍（忽略極淡的抗鋸齒雜點）
    return im.getchannel('A').point(lambda a: 255 if a > 6 else 0).getbbox()


def union(boxes):
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))


def resize_rgba(im, size):  # 預乘 alpha 再縮，邊緣不發黑
    return im.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')


def sprite(j, box):
    im = load(j['name']).crop(box)
    w, h = im.size
    p = round(j.get('pad', 0.04) * max(w, h))
    pb = round(j['padB'] * max(w, h)) if 'padB' in j else p
    cw, ch = w + 2 * p, h + p + pb
    if j.get('aspect'):  # 補透明邊到指定寬高比（對齊 CSS 框，contain 時才會剛好填滿）
        cw, ch = max(cw, round(ch * j['aspect'])), max(ch, round(cw / j['aspect']))
    cv = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    cv.paste(im, ((cw - w) // 2, ch - h - pb))
    s = j.get('size', 560) / max(cv.size)
    return resize_rgba(cv, (max(1, round(cv.width * s)), max(1, round(cv.height * s))))


def save(im, out):
    path = os.path.join(OUT, out + '.webp')
    im.save(path, 'WEBP', quality=85, method=6)
    print(f'寫入 {out}.webp  {im.size[0]}×{im.size[1]}  {os.path.getsize(path) // 1024}KB')


def card(j):
    W, H, S = j['w'], j['h'], 3  # 3 倍超取樣再縮
    w, h = W * S, H * S
    bg = Image.new('RGBA', (w, h), j['bg'])
    d = ImageDraw.Draw(bg)
    lw = max(2, round(w * 0.012))
    if j.get('pattern') == 'grid':  # 等角格線（呼應海面格線）
        step = w / 3.2
        for k in range(-20, 21):
            xk = w / 2 + k * step
            for m in (0.5, -0.5):  # 斜率 ±0.5＝2:1 等角線，通過 (xk, 中線)
                d.line([(-w, h / 2 + m * (-w - xk)), (2 * w, h / 2 + m * (2 * w - xk))], fill=j['bg2'], width=lw)
    elif j.get('pattern') == 'stripe':  # 斜條紋
        step = w / 4.2
        for k in range(-10, 14):
            x0 = k * step
            d.polygon([(x0, 0), (x0 + step / 2, 0), (x0 + step / 2 - h, h), (x0 - h, h)], fill=j['bg2'])
    # 中央柔光圈（讓圖示浮出來）
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    gr = w * j.get('glowR', 0.36)
    ImageDraw.Draw(glow).ellipse([w / 2 - gr, h / 2 - gr, w / 2 + gr, h / 2 + gr], fill=(255, 255, 255, j.get('glow', 90)))
    bg = Image.alpha_composite(bg, glow.filter(ImageFilter.GaussianBlur(w * 0.06)))
    # 白色內框（inset＝內縮比例；遊戲用 cover 顯示、卡片寬高比 0.78–1.35，內縮要夠大才不會被裁掉）
    d = ImageDraw.Draw(bg)
    ins, rad, fw = w * j.get('inset', 0.075), w * 0.06, round(w * j.get('frame', 0.035))
    d.rounded_rectangle([ins, ins, w - ins, h - ins], radius=rad, outline=(255, 255, 255, 255), width=fw)
    # 3D 圖示＋柔和投影
    ic = load(j['icon'])
    ic = ic.crop(abox(ic))
    s = min(w * j.get('iconW', 0.6) / ic.width, h * j.get('iconH', 0.42) / ic.height)
    ic = resize_rgba(ic, (round(ic.width * s), round(ic.height * s)))
    x, y = (w - ic.width) // 2, (h - ic.height) // 2 - round(h * 0.01)
    sh = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    a = ic.getchannel('A').point(lambda v: v * j.get('shadow', 0.32))
    sh.paste(Image.new('RGBA', ic.size, (20, 30, 60, 255)), (x + round(w * 0.015), y + round(w * 0.03)), a)
    bg = Image.alpha_composite(bg, sh.filter(ImageFilter.GaussianBlur(w * 0.018)))
    bg.alpha_composite(ic, (x, y))
    return bg.resize((W, H), Image.LANCZOS).convert('RGB')


done = set()
for name, j in JOBS.items():
    if name in done or not j.get('out'):
        continue
    if j.get('kind') == 'card':
        save(card(j), j['out']); done.add(name); continue
    if j.get('group'):
        mates = [n for n, m in JOBS.items() if m.get('group') == j['group']]
        box = union([abox(load(n)) for n in mates])
        for n in mates:
            if JOBS[n].get('out'):
                save(sprite(JOBS[n], box), JOBS[n]['out']); done.add(n)
    else:
        save(sprite(j, abox(load(name))), j['out']); done.add(name)
