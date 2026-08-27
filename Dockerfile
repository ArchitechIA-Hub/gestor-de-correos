# Imagen de demo temporal (VPS). No pensada como imagen de producción
# definitiva: usa `npm run build` + `npm run start` directo, sin output
# "standalone", para mantener el Dockerfile simple mientras dure la demo.
FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# El datasource del schema queda fijo en "sqlite" para dev local (CLAUDE.md,
# SQLite en el prototipo). Esta imagen es la única que corre contra Postgres,
# así que el swap de provider se hace acá en el build, no en el repo.
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma

RUN npx prisma generate

# `next build` evalúa módulos que exigen estas env vars al recolectar datos
# de /api/scan (OpenAI() y el Prisma client con el adapter de Postgres), sin
# llegar a usarlas de verdad en build time. Placeholders solo para el build —
# los valores reales se pasan en runtime vía `docker run -e ...`.
ENV OPENAI_API_KEY="sk-build-placeholder"
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
