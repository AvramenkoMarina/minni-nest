FROM node:20-bookworm

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENTRYPOINT ["sh", "-c", "npm ci && exec \"$@\"", "--"]
CMD ["npm", "test"]
