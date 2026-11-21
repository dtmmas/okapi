FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY --from=build /app/dist ./dist
COPY --from=build /app/api ./api
COPY --from=build /app/shared ./shared
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/public ./public
COPY --from=build /app/.env.example ./.env.example

EXPOSE 3002

CMD ["npm", "run", "start"]
