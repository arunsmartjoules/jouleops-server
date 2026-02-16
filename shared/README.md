#@jouleops/shared

This package contains common code shared across all microservices in the JouleOps backend.

## 📁 Structure

- **src/lib:** Core infrastructure (Database pool, Redis client).
- **src/middleware:** Shared Express middleware (Error handling, common validation).
- **src/utils:** General utilities (API response helpers, date formatting).
- **src/types:** Shared TypeScript interfaces and Zod schemas.
- **src/errors:** Custom error classes (AppError).

## 🛠️ Usage

This package is a workspace dependency. To use it in a new service:

1. Add it to `package.json`:

```json
"dependencies": {
  "@jouleops/shared": "workspace:*"
}
```

2. Import it in your code:

```typescript
import { queryOne, sendSuccess } from "@jouleops/shared";
```

## ⚠️ Important

Changes to this package will trigger a re-build/re-test for **all** services that depend on it in the CI/CD pipeline. Always ensure backward compatibility when modifying shared utilities.
