import sys,json,os
from PIL import Image,ImageStat
im=Image.open(sys.argv[1]).convert('RGB')
w,h=im.size
# Scan for quiet horizontal boundaries near each portrait-sized cut.
thumb=im.resize((80,max(1,round(h*80/w))))
scale=h/thumb.height
out=[]; top=0; index=0
while top<h and index<48:
    target=min(h,top+round(w*1.65))
    if target<h:
        low=max(top+round(w*.9),target-round(w*.3)); high=min(h,target+round(w*.3))
        candidates=range(max(0,round(low/scale)),min(thumb.height,round(high/scale)),2)
        def score(y):
            stat=ImageStat.Stat(thumb.crop((0,y,80,min(thumb.height,y+2))))
            return sum(stat.var)+abs(y*scale-target)*.08
        row=min(candidates,key=score,default=round(target/scale)); bottom=min(h,round(row*scale))
    else:bottom=h
    if h-bottom<w*.4:bottom=h
    if bottom-top>=w*.35:
        crop=im.crop((0,top,w,bottom));crop.thumbnail((1000,2400))
        name=os.path.join(sys.argv[2],f'img_{sys.argv[3]}_slice{index}.jpg');crop.save(name,quality=92);out.append(name)
    top=bottom;index+=1
print(json.dumps(out))
