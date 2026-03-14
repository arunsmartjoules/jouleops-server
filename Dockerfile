# Use official Bun slim image
FROM oven/bun:1.2.1-slim AS base
WORKDIR /app

# Stage 1: Dependencies
FROM base AS deps
# Copy root configuration
COPY package.json bun.lock tsconfig.json turbo.json ./
# Copy all package.json files to allow for workspace dependency installation
COPY shared/package.json shared/
COPY gateway/package.json gateway/
COPY services/rbac/package.json services/rbac/
COPY services/sitelogs/package.json services/sitelogs/
COPY services/pm/package.json services/pm/
COPY services/tickets/package.json services/tickets/
COPY services/attendance/package.json services/attendance/
COPY services/utility/package.json services/utility/

RUN bun install --frozen-lockfile

# Stage 2: Builder
FROM deps AS builder
ARG SERVICE_NAME
COPY . .
# Turbo can be used here if build step is needed
# RUN bunx turbo run build --filter=${SERVICE_NAME}

# Stage 3: Runner
FROM base AS runner
ARG SERVICE_NAME
ENV NODE_ENV=production

# Copy only what's necessary from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/${SERVICE_NAME} ./${SERVICE_NAME}
# Copy shared resources if they are required at runtime
COPY --from=builder /app/shared ./shared

# Set workdir to the specific service
WORKDIR /app/${SERVICE_NAME}

# Default ports
EXPOSE 3420 3421 3422 3423 3424 3425 3426 3428

CMD ["bun", "run", "start"]
