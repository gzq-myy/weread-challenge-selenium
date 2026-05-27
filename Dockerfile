FROM node:lts-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev
RUN npx patchright install --with-deps chromium
COPY ./src ./src

CMD ["node", "src/weread-challenge.js", "run"]
