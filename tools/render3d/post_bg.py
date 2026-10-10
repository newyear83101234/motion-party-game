# 背景後製：縮到目標尺寸 → 降一點飽和、往白色提亮（襯底）→ webp，品質由高往低試到 ≤150KB
# 用法：python post_bg.py <manifest.json>（由 render_bg.js 產生）
import sys, json, os, io
from PIL import Image, ImageEnhance, ImageStat

LIMIT = 150 * 1024
bad = False
for j in json.load(open(sys.argv[1], encoding='utf-8')):
    im = Image.open(j['raw']).convert('RGB')
    if max(ImageStat.Stat(im).stddev) < 6:  # 幾乎單色＝截圖失敗，不要蓋掉原本的圖
        print(f"⚠ 跳過 {os.path.basename(j['out'])}：截圖幾乎是空白，請重跑"); bad = True; continue
    tw, th = j['w'], j['h']
    if abs(im.width / im.height - tw / th) > 0.01:  # 寬高比不同 → 先裁中間
        if im.width / im.height > tw / th:
            nw = round(im.height * tw / th); im = im.crop(((im.width - nw) // 2, 0, (im.width - nw) // 2 + nw, im.height))
        else:
            nh = round(im.width * th / tw); im = im.crop((0, (im.height - nh) // 2, im.width, (im.height - nh) // 2 + nh))
    if im.size != (j['w'], j['h']):
        im = im.resize((j['w'], j['h']), Image.LANCZOS)
    im = ImageEnhance.Color(im).enhance(j['sat'])
    im = Image.blend(im, Image.new('RGB', im.size, (250, 252, 255)), j['lift'])
    for q in (86, 82, 78, 74, 70, 66, 62, 58, 54, 50):
        buf = io.BytesIO(); im.save(buf, 'WEBP', quality=q, method=6)
        if buf.tell() <= LIMIT:
            break
    open(j['out'], 'wb').write(buf.getvalue())
    print(f"寫入 {os.path.basename(j['out'])}  {im.size[0]}×{im.size[1]}  q{q}  {buf.tell() // 1024}KB" + ("  ⚠超過150KB" if buf.tell() > LIMIT else ''))
sys.exit(1 if bad else 0)
