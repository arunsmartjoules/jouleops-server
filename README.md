# SmartOps Backend (Microservices Monorepo)

This repository contains the backend services for SmartOps, organized as a microservices architecture within a monorepo managed by **Turborepo** and **Bun**.

## 🏗️ Architecture

The system is split into multiple specialized services, coordinated by an API Gateway.

- **Gateway:** Entry point for all requests, handling routing and initial authentication.
- **Shared:** Common utilities, database clients, middleware, and types used across all services.
- **Services:**
  - `rbac`: Authentication, Roles, and Permissions.
  - `profiles`: User information and profiles.
  - `sites`: Site and asset management.
  - `tickets`: Complaints and category management.
  - `attendance`: Attendance tracking.
  - `pm`: Preventive Maintenance (checklists, tasks).
  - `sitelogs`: Performance logs and chiller readings.
  - `notifications`: Push and in-app notifications.
  - `email`: Transactional email service (Resend).
  - `whatsapp`: WhatsApp integration.

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh)
- [Docker](https://www.docker.com/) (for containerized deployment)

### Installation

```bash
bun install
```

### Development

Run all services simultaneously:

```bash
bun run dev
```

Run a specific service:

```bash
bun --cwd services/rbac run dev
```

## 🧪 Testing

We use **Bun Test** (Vitest compatible) for all testing.

```bash
# Run all tests
bun run test

# Run tests for a specific service
cd services/sites && bun test
```

## 📦 Deployment

The system is designed to be deployed using Docker.

- **Local Stack:** `docker-compose up --build`
- **Independent CI/CD:** GitHub Actions are configured to build and test services independently based on changed files.

## 🛠️ Management

This monorepo uses **NPM Workspaces** (managed by Bun).

- All shared code lives in `/shared`.
- When you update `/shared`, all services automatically link to the new version.
- Use `turbo` commands for efficient building and testing.

---

© 2024 Smart Joules. All rights reserved.
