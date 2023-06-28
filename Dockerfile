FROM node:16

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install

COPY . .

RUN npm run build

CMD ["npm", "start"]