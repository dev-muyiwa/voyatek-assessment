FROM node:22 AS build

LABEL authors="Moyosoreoluwa"

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

# Test stage
FROM build AS test

RUN npm test

FROM node:22-slim AS production

WORKDIR /usr/src/app

# Install OpenSSL to fix Prisma warnings
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/prisma ./prisma
COPY --from=build /usr/src/app/package*.json ./

# Install production deps and ensure Prisma CLI is available at runtime for migrate deploy
RUN npm install --omit=dev && npm install prisma --no-save

EXPOSE 3000

CMD ["node", "dist/index.js"]