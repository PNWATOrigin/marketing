import sys
from rembg import remove, new_session

# 가장 가벼운 모델(u2netp, ~4.7MB)을 써서 배포 크기/처리 시간을 최소화한다.
session = new_session('u2netp')

with open(sys.argv[1], 'rb') as f:
    data = f.read()

result = remove(data, session=session)

with open(sys.argv[2], 'wb') as f:
    f.write(result)
