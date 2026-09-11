import sys, json, os
os.environ.setdefault('OMP_NUM_THREADS','1')
from PIL import Image, ImageFilter, ImageStat
from rembg import remove, new_session
im=Image.open(sys.argv[1]).convert('RGB'); im.thumbnail((800,1600))
w,h=im.size
# Locate a continuous photographic band; sparse type on a plain background has few rich tiles.
step=40; bands=[]
for y in range(0,h-step+1,step):
    rich=0; total=0
    for x in range(0,w-step+1,step):
        tile=im.crop((x,y,x+step,y+step)).resize((16,16)).quantize(colors=32)
        counts=sorted((n for n,c in tile.getcolors()),reverse=True)
        rich += len(counts)>=20 and sum(counts[:2])<180
        total+=1
    bands.append(rich/max(1,total)>.25)
runs=[]; start=None
for i,ok in enumerate(bands+[False]):
    if ok and start is None:start=i
    if not ok and start is not None:
        if (i-start)*step>=160:runs.append((start*step,min(h,i*step)))
        start=None
if not runs:sys.exit(2)
y0,y1=max(runs,key=lambda r:r[1]-r[0]); crop=im.crop((0,max(0,y0-10),w,min(h,y1+10)))
cut=remove(crop,session=new_session('u2netp')).convert('RGBA')
a=cut.getchannel('A'); hist=a.histogram(); coverage=sum(hist[64:])/(cut.width*cut.height)
if not .08<coverage<.88:sys.exit(2)
bbox=a.point(lambda x:255 if x>64 else 0).getbbox()
if not bbox:sys.exit(2)
cut=cut.crop(bbox); cut.thumbnail((850,1250))
layer=Image.new('RGBA',(cut.width+60,cut.height+60));layer.alpha_composite(cut,(30,30))
a=layer.getchannel('A'); outline=a.filter(ImageFilter.MaxFilter(15));shadow=outline.filter(ImageFilter.GaussianBlur(9)).point(lambda x:int(x*.22))
sticker=Image.new('RGBA',layer.size); shade=Image.new('RGBA',layer.size,(20,10,40));shade.putalpha(shadow);sticker.alpha_composite(shade,(0,5))
white=Image.new('RGBA',layer.size,'white');white.putalpha(outline);sticker.alpha_composite(white);sticker.alpha_composite(layer)
sticker.save(sys.argv[2])
canvas=Image.new('RGB',(1080,1920),(231,240,255));canvas.paste(sticker,((1080-sticker.width)//2,(1920-sticker.height)//2),sticker)
canvas.save(sys.argv[3],quality=94)
print(json.dumps({'coverage':coverage,'region':[0,y0,w,y1]}))
