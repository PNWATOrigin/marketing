FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg fonts-noto-cjk python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/product-fetch
ENV PYTHON_PATH=/opt/product-fetch/bin/python
WORKDIR /app
COPY requirements.txt ./
RUN /opt/product-fetch/bin/pip install --no-cache-dir -r requirements.txt
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/index.js"]
