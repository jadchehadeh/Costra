FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY prisma prisma
RUN npm ci
RUN npx prisma generate
COPY apps/api apps/api
RUN npm run build -w @costra/api
CMD ["sh","-c","npx prisma migrate deploy && node apps/api/dist/server.js"]
