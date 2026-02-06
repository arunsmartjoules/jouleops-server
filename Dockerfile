# Use official Bun image
FROM oven/bun:1.2-slim AS base
WORKDIR /app

# Stage 1: Dependencies
FROM base AS deps
COPY package.json bun.lockb ./
COPY shared/package.json shared/
COPY gateway/package.json gateway/
COPY services/rbac/package.json services/rbac/
COPY services/profiles/package.json services/profiles/
COPY services/sites/package.json services/sites/
COPY services/email/package.json services/email/
COPY services/notifications/package.json services/notifications/
COPY services/sitelogs/package.json services/sitelogs/
COPY services/pm/package.json services/pm/
COPY services/whatsapp/package.json services/whatsapp/
COPY services/tickets/package.json services/tickets/

RUN bun install --frozen-lockfile

# Stage 2: Builder
FROM deps AS builder
ARG SERVICE_NAME
COPY . .
# We don't need a full build step for Bun usually, as it runs TS directly,
# but if you use 'turbo build', run it here.
# RUN bunx turbo run build --filter=${SERVICE_NAME}

# Stage 3: Runner
FROM base AS runner
ARG SERVICE_NAME
COPY --from=builder /app /app

# Set workdir to the specific service
WORKDIR /app/${SERVICE_NAME}

# Default port
EXPOSE 3424

CMD ["bun", "run", "start"]
