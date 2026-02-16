# JouleOps API Gateway

The Gateway is the single entry point for all frontend and external requests.

## 🛡️ Responsibilities

- **Request Proxying:** Routes requests to the appropriate microservice.
- **Authentication:** Validates JWT tokens and API keys at the edge.
- **Rate Limiting:** Protects downstream services from abuse.
- **CORS Management:** Handles cross-origin resource sharing consistently.

## 📍 Routing Map

- `/api/auth` -> RBAC Service
- `/api/users` -> Profiles Service
- `/api/sites` -> Sites Service
- `/api/tickets` -> Tickets Service
- `/api/notifications` -> Notifications Service
- `/api/email` -> Email Service
- ... and more.

## 🔧 Configuration

The gateway relies on environment variables for service URLs:

- `RBAC_SERVICE_URL`
- `PROFILES_SERVICE_URL`
- `SITES_SERVICE_URL`
  ...etc.
