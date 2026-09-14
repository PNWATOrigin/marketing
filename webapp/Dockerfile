FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg fonts-noto-cjk python3 python3-venv tesseract-ocr tesseract-ocr-kor \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/product-fetch
ENV PYTHON_PATH=/opt/product-fetch/bin/python
WORKDIR /app
COPY requirements.txt ./
RUN /opt/product-fetch/bin/pip install --no-cache-dir -r requirements.txt
# 배포 후 첫 요청이 느려지지 않도록, 가장 가벼운 배경제거 모델(u2netp, ~5MB)을 빌드 시점에 미리 받아둔다.
RUN /opt/product-fetch/bin/python -c "from rembg import new_session; new_session('u2netp')"
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
 # Validate the fallback with the exact Linux FFmpeg shipped in production.
RUN ffmpeg -v error -f lavfi -i color=s=320x240 -vf "drawtext=fontfile=/app/assets/fonts/Jua-Regular.ttf:text='한글 자막':fontsize=100:borderw=6" -frames:v 1 -f null -

ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/index.js"]
