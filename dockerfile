FROM node:22-bookworm-slim AS build

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS production

WORKDIR /app

ENV NODE_ENV=production \
    TZ="Asia/Kolkata" \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
RUN mkdir -p uploads && chown -R node:node /app

USER node

EXPOSE 5000

CMD ["npm", "start"]
