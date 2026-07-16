FROM node:22-alpine

# System packages: ffmpeg for video frame extraction
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json ./
RUN npm install --omit=dev

# Copy source
COPY . .

# /data is where the SQLite database and reports live.
# On Railway: add a Volume and mount it at /data so data survives redeploys.
# Locally: docker run -v $(pwd)/data:/data ...
RUN mkdir -p /data

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/bot.sqlite3
ENV REPORT_DIR=/data/reports

CMD ["node", "--experimental-sqlite", "src/index.js"]
