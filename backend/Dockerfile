FROM node:20

WORKDIR /app

# Copy definisi package dulu agar Docker bisa cache layer node_modules
COPY package*.json ./
RUN npm install

# Copy seluruh kode backend ke dalam kontainer
COPY . .

# Generate Prisma Client di dalam kontainer
RUN npx prisma generate

EXPOSE 3000

CMD ["npm", "run", "dev"]