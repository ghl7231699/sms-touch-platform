FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build:web

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3100

EXPOSE 3100

CMD ["npm", "run", "start"]
