# Build context: the repo root (or the staged copy deploy/deploy.sh ships). Needs apps/api/dist built first.
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w apps/api --omit=dev && npm cache clean --force
COPY apps/api/dist apps/api/dist
WORKDIR /app/apps/api
USER node
EXPOSE 8787
CMD ["node", "dist/index.js"]
