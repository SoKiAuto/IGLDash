
FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN npm ci

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Temporary placeholder for the build only.
# Compose supplies the real DATABASE_URL at runtime.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build_db" npm run build

EXPOSE 3000

CMD ["npm", "run", "start", "--", "-H", "0.0.0.0"]
