import { describe, expect, it, mock, beforeEach } from "bun:test";

// Mock@jouleops/shared BEFORE importing the repository
mock.module("@jouleops/shared", () => ({
  queryOne: mock(() => Promise.resolve(null)),
  query: mock(() => Promise.resolve([])),
  cached: mock((key, fn) => fn()), // Bypass cache and execute function
  cacheDel: mock(() => Promise.resolve()),
  CACHE_PREFIX: { USER: "u:" },
  TTL: { MEDIUM: 300 },
}));

import * as usersRepository from "./usersRepository.ts";
import { queryOne, query } from "@jouleops/shared";

const mockUser = {
  user_id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: "admin",
  is_active: true,
  created_at: new Date(),
};

describe("usersRepository", () => {
  beforeEach(() => {
    (queryOne as any).mockClear();
    (query as any).mockClear();
  });

  describe("getUserById", () => {
    it("should query the database and return user", async () => {
      (queryOne as any).mockResolvedValueOnce(mockUser);

      const user = await usersRepository.getUserById("user-1");

      expect(user).toEqual(mockUser);
      expect(queryOne).toHaveBeenCalledWith(
        expect.stringContaining("SELECT * FROM users WHERE user_id = $1"),
        ["user-1"],
      );
    });

    it("should return null if user not found", async () => {
      (queryOne as any).mockResolvedValueOnce(null);

      const user = await usersRepository.getUserById("nonexistent");

      expect(user).toBeNull();
    });
  });

  describe("createUser", () => {
    it("should construct correct SQL and return new user", async () => {
      const input = {
        user_id: "user-2",
        email: "new@example.com",
        name: "New User",
      };
      (queryOne as any).mockResolvedValueOnce({
        ...input,
        role: "user",
        is_active: true,
        created_at: new Date(),
      });

      const user = await usersRepository.createUser(input);

      expect(user.email).toBe("new@example.com");
      expect(queryOne).toHaveBeenCalled();
      const lastCall = (queryOne as any).mock.calls[0];
      expect(lastCall[0]).toContain("INSERT INTO users");
      expect(lastCall[1]).toEqual(Object.values(input));
    });
  });

  describe("getAllUsers", () => {
    it("should handle pagination and return data with meta", async () => {
      (queryOne as any).mockResolvedValueOnce({ count: "100" });
      (query as any).mockResolvedValueOnce([mockUser]);

      const result = await usersRepository.getAllUsers({ page: 2, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(100);
      expect(result.pagination.totalPages).toBe(10);
      expect(result.pagination.page).toBe(2);

      // Verify data query has correct limit/offset
      const dataCall = (query as any).mock.calls[0];
      expect(dataCall[1]).toContain(10); // Limit
      expect(dataCall[1]).toContain(10); // Offset
    });
  });
});
