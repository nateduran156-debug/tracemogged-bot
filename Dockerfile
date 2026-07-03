FROM node:22-alpine

# ffmpeg as a system package — much lighter than the npm binary package
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

CMD ["node", "src/index.js"]
