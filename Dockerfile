FROM node:22 as build

LABEL authors="Schoolinka"

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

FROM node:22-slim as production

WORKDIR /usr/src/app

COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/prisma ./prisma
COPY --from=build /usr/src/app/package*.json ./

# Install production deps and ensure Prisma CLI is available at runtime for migrate deploy
RUN npm install --omit=dev && npm install prisma --no-save

EXPOSE 3000

CMD ["node", "dist/index.js"]