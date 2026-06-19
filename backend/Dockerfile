FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json* ./
COPY backend/prisma ./prisma/
RUN npm install
RUN npx prisma generate
COPY backend/ .
RUN npm run build
EXPOSE 3001
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main"]
