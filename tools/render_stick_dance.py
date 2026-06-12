# -*- coding: utf-8 -*-
"""
render_stick_dance.py — 把「適合小孩的火柴人編舞」渲染成參考影片(給阿葉餵 AI 生舞者影片用)。
乾淨火柴人：頭圓 + 單一脊椎線 + 肩線 + 手臂 + 髖線 + 腿。動作大、正面、清楚。
輸出 10 秒 mp4 到 tools/_src_song/stick_dance_ref.mp4
"""
import os, math, subprocess, tempfile, shutil
from PIL import Image, ImageDraw
import imageio_ffmpeg

W, H, FPS, DUR = 720, 1280, 24, 10  # 直式(手機)、10秒
OUT = r"d:\Claude\Projects\GAME DIY\tools\_src_song\stick_dance_ref.mp4"

# 動作模板：landmark idx -> (x,y) normalized。0鼻 11左肩 12右肩 13左肘 14右肘 15左腕 16右腕 23左髖 24右髖 25左膝 26右膝 27左踝 28右踝
def base():
    return {0:(.5,.12),11:(.40,.27),12:(.60,.27),13:(.36,.40),14:(.64,.40),15:(.36,.52),16:(.64,.52),
            23:(.46,.56),24:(.54,.56),25:(.45,.77),26:(.55,.77),27:(.45,.95),28:(.55,.95)}
def pose_handsup():
    p=base(); p[13]=(.37,.15);p[15]=(.35,.03);p[14]=(.63,.15);p[16]=(.65,.03); return p   # 雙手舉高歡呼
def pose_tpose():
    p=base(); p[13]=(.28,.27);p[15]=(.16,.27);p[14]=(.72,.27);p[16]=(.84,.27); return p   # 雙手平舉T
def pose_star():
    p=base(); p[13]=(.30,.17);p[15]=(.22,.06);p[14]=(.70,.17);p[16]=(.78,.06)
    p[25]=(.38,.77);p[27]=(.32,.95);p[26]=(.62,.77);p[28]=(.68,.95); return p              # 大字星星(腿張開)
def pose_rhand():
    p=base(); p[14]=(.63,.15);p[16]=(.65,.03);p[13]=(.40,.42);p[15]=(.40,.54); return p    # 右手舉(左手垂)
def pose_lhand():
    p=base(); p[13]=(.37,.15);p[15]=(.35,.03);p[14]=(.60,.42);p[16]=(.60,.54); return p    # 左手舉
def pose_clap():
    p=base(); p[13]=(.44,.34);p[15]=(.49,.40);p[14]=(.56,.34);p[16]=(.51,.40); return p    # 胸前拍手

SEQ = [pose_handsup(), pose_star(), pose_lhand(), pose_rhand(), pose_clap(), pose_tpose()]  # 6動作循環

def lerp(a,b,t): return a+(b-a)*t
def interp(p,q,t):
    return {k:(lerp(p[k][0],q[k][0],t), lerp(p[k][1],q[k][1],t)) for k in p}

def cur_pose(tsec):
    seg = DUR/len(SEQ)                       # 每個動作的時間
    i = min(len(SEQ)-1, int(tsec/seg)); j=(i+1)%len(SEQ)
    r = (tsec - i*seg)/seg
    e = 0 if r<0.55 else (r-0.55)/0.45       # 前半停住、後半過渡(像Just Dance擺好再換)
    return interp(SEQ[i], SEQ[j], e)

def draw(pose):
    im = Image.new("RGB",(W,H),(18,10,30)); d=ImageDraw.Draw(im)
    def XY(i): return (pose[i][0]*W, pose[i][1]*H)
    def mid(a,b): return ((pose[a][0]+pose[b][0])/2*W,(pose[a][1]+pose[b][1])/2*H)
    lw=max(8,int(W*0.018))
    def line(a,b,col=(124,255,176)):
        d.line([XY(a),XY(b)],fill=col,width=lw)
    neck=mid(11,12); hipc=mid(23,24)
    # 脖子(頭→肩中點、解決浮頭) + 脊椎(單線) + 肩線 + 髖線
    d.line([XY(0),neck],fill=(124,255,176),width=lw)
    d.line([neck,hipc],fill=(124,255,176),width=lw)
    d.line([XY(11),XY(12)],fill=(124,255,176),width=lw)
    d.line([XY(23),XY(24)],fill=(124,255,176),width=lw)
    # 手臂/腿
    for a,b in [(11,13),(13,15),(12,14),(14,16),(23,25),(25,27),(24,26),(26,28)]: line(a,b)
    # 關節圓點(更好看)
    for i in [11,12,13,14,15,16,23,24,25,26,27,28]:
        x,y=XY(i); r=lw*0.7; d.ellipse([x-r,y-r,x+r,y+r],fill=(124,255,176))
    # 頭
    nx,ny=XY(0); hr=W*0.06; d.ellipse([nx-hr,ny-hr,nx+hr,ny+hr],fill=(124,255,176))
    return im

tmp = tempfile.mkdtemp()
n = FPS*DUR
for f in range(n):
    draw(cur_pose(f/FPS)).save(os.path.join(tmp,f"f{f:04d}.png"))
ff = imageio_ffmpeg.get_ffmpeg_exe()
os.makedirs(os.path.dirname(OUT),exist_ok=True)
subprocess.run([ff,"-y","-v","quiet","-framerate",str(FPS),"-i",os.path.join(tmp,"f%04d.png"),
                "-c:v","libx264","-pix_fmt","yuv420p",OUT],check=True)
shutil.rmtree(tmp,ignore_errors=True)
print("OK 渲染完成 ->",OUT,f"({n}幀 {DUR}秒 {W}x{H})")
