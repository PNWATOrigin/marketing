import sys
from PIL import Image,ImageOps,ImageFilter
bg=ImageOps.fit(Image.open(sys.argv[1]).convert('RGB'),(1080,1920),centering=(.5,.5)).convert('RGBA')
fg=Image.open(sys.argv[2]).convert('RGBA');fg.thumbnail((780,1250),Image.Resampling.LANCZOS)
x=(1080-fg.width)//2;y=(1920-fg.height)//2
shadow=Image.new('RGBA',(1080,1920));layer=Image.new('RGBA',fg.size,(0,0,0,0));layer.putalpha(fg.getchannel('A').point(lambda a:int(a*.22)))
shadow.alpha_composite(layer,(x+12,y+22));shadow=shadow.filter(ImageFilter.GaussianBlur(16));bg.alpha_composite(shadow);bg.alpha_composite(fg,(x,y));bg.convert('RGB').save(sys.argv[3],quality=94)
