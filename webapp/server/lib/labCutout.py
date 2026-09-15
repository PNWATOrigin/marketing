import os,sys,json
os.environ.setdefault('OMP_NUM_THREADS','1')
os.environ.setdefault('OPENBLAS_NUM_THREADS','1')
from PIL import Image,ImageFilter
from rembg import remove,new_session
im=Image.open(sys.argv[1]).convert('RGB');im.thumbnail((760,1100))
cut=remove(im,session=new_session('u2netp')).convert('RGBA')
# Keep the largest connected foreground; isolated headings and labels are removed.
a=cut.getchannel('A'); small=a.copy();small.thumbnail((180,260));w,h=small.size
pix=small.load();seen=set();best=[]
for y in range(h):
 for x in range(w):
  if (x,y) in seen or pix[x,y]<110:continue
  stack=[(x,y)];seen.add((x,y));component=[]
  while stack:
   px,py=stack.pop();component.append((px,py))
   for nx,ny in ((px-1,py),(px+1,py),(px,py-1),(px,py+1)):
    if 0<=nx<w and 0<=ny<h and (nx,ny) not in seen and pix[nx,ny]>=110:seen.add((nx,ny));stack.append((nx,ny))
  if len(component)>len(best):best=component
coverage=len(best)/(w*h)
if not .025<coverage<.90:raise ValueError('No separable foreground')
mask=Image.new('L',(w,h));mp=mask.load()
for x,y in best:mp[x,y]=255
mask=mask.filter(ImageFilter.MaxFilter(3)).resize(cut.size,Image.Resampling.BILINEAR)
from PIL import ImageChops
cut.putalpha(ImageChops.multiply(a,mask));box=cut.getchannel('A').getbbox()
if not box:raise ValueError('Empty cutout')
cut=cut.crop(box)
if min(cut.size)<60:raise ValueError('Foreground too small')
cut.save(sys.argv[2])
colors=cut.convert('RGB').resize((64,64)).quantize(colors=5).convert('RGB').getcolors(4096)
colors=sorted(colors,reverse=True)
palette=['#%02x%02x%02x'%rgb for n,rgb in colors[:3]]
print(json.dumps({'palette':palette,'width':cut.width,'height':cut.height}))
