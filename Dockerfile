# Use official Node image and install Bun
FROM node:latest AS base
RUN npm install -g bun@1.2.21
WORKDIR /app

# Stage 1: Dependencies
FROM base AS deps
COPY package.json bun.lock ./
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
# If you have a build step, uncomment this:
# RUN bunx turbo run build --filter=${SERVICE_NAME}

# Stage 3: Runner
FROM base AS runner
ARG SERVICE_NAME
COPY --from=builder /app /app

# Set workdir to the specific service
WORKDIR /app/${SERVICE_NAME}

# Default ports (mapping to your config)
# Expose all possible microservice ports
EXPOSE 3420 3421 3422 3423 3424 3425 3426 3428

CMD ["bun", "run", "start"]
