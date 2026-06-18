import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserByEmail: vi.fn(),
    getUserById: vi.fn(),
    createUser: vi.fn(),
    updateLastSignedIn: vi.fn(),
    createPasswordResetToken: vi.fn(),
    getValidPasswordResetToken: vi.fn(),
    markPasswordResetTokenUsed: vi.fn(),
    updateUserPassword: vi.fn(),
  };
});

// ─── Mock notification ────────────────────────────────────────────────────────
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(undefined),
}));

import {
  getUserByEmail,
  getUserById,
  createUser,
  updateLastSignedIn,
  createPasswordResetToken,
  getValidPasswordResetToken,
  markPasswordResetTokenUsed,
  updateUserPassword,
} from "./db";

// ─── Context helpers ──────────────────────────────────────────────────────────

type CookieCall = { name: string; value: string; options: Record<string, unknown> };

function buildCtx(overrides?: Partial<TrpcContext>): {
  ctx: TrpcContext;
  cookies: CookieCall[];
  clearedCookies: Array<{ name: string; options: Record<string, unknown> }>;
} {
  const cookies: CookieCall[] = [];
  const clearedCookies: Array<{ name: string; options: Record<string, unknown> }> = [];

  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
      cookies: {},
    } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        cookies.push({ name, value, options });
      },
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as unknown as TrpcContext["res"],
    ...overrides,
  };

  return { ctx, cookies, clearedCookies };
}

const mockUser = {
  id: 42,
  openId: null,
  name: "Test User",
  email: "test@example.com",
  passwordHash: "$2a$12$hashedpassword",
  googleId: null,
  loginMethod: "email",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("auth.register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates user and sets session cookie on success", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(null);
    vi.mocked(createUser).mockResolvedValue(mockUser);

    const { ctx, cookies } = buildCtx();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.register({
      name: "Test User",
      email: "test@example.com",
      password: "securepassword123",
    });

    expect(result.email).toBe("test@example.com");
    expect(result.id).toBe(42);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.name).toBe(COOKIE_NAME);
    expect(typeof cookies[0]?.value).toBe("string");
    expect(cookies[0]?.value.length).toBeGreaterThan(10);
  });

  it("throws when email already exists", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(mockUser);

    const { ctx } = buildCtx();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.register({
        name: "Test User",
        email: "test@example.com",
        password: "securepassword123",
      })
    ).rejects.toThrow("An account with this email already exists.");
  });
});

describe("auth.login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets session cookie on valid credentials", async () => {
    // Use a real bcrypt hash for "password123"
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("password123", 4); // low cost for tests
    vi.mocked(getUserByEmail).mockResolvedValue({ ...mockUser, passwordHash: hash });
    vi.mocked(updateLastSignedIn).mockResolvedValue(undefined);

    const { ctx, cookies } = buildCtx();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.login({
      email: "test@example.com",
      password: "password123",
    });

    expect(result.email).toBe("test@example.com");
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.name).toBe(COOKIE_NAME);
  });

  it("throws on invalid password", async () => {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("correctpassword", 4);
    vi.mocked(getUserByEmail).mockResolvedValue({ ...mockUser, passwordHash: hash });

    const { ctx } = buildCtx();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({ email: "test@example.com", password: "wrongpassword" })
    ).rejects.toThrow("Invalid email or password.");
  });

  it("throws when user not found", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(null);

    const { ctx } = buildCtx();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({ email: "nobody@example.com", password: "anything" })
    ).rejects.toThrow("Invalid email or password.");
  });
});

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = buildCtx({ user: mockUser });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({ maxAge: -1 });
  });
});

describe("auth.me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no cookie present", async () => {
    const { ctx } = buildCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });
});

describe("auth.requestPasswordReset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success for unknown email (anti-enumeration)", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(null);

    const { ctx } = buildCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.requestPasswordReset({ email: "nobody@example.com" });

    expect(result).toEqual({ success: true });
    expect(createPasswordResetToken).not.toHaveBeenCalled();
  });

  it("creates token for known email", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(mockUser);
    vi.mocked(createPasswordResetToken).mockResolvedValue(undefined);

    const { ctx } = buildCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.requestPasswordReset({ email: "test@example.com" });

    expect(result).toEqual({ success: true });
    expect(createPasswordResetToken).toHaveBeenCalledWith(
      mockUser.id,
      expect.any(String)
    );
  });
});

describe("auth.resetPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws for invalid/expired token", async () => {
    vi.mocked(getValidPasswordResetToken).mockResolvedValue(null);

    const { ctx } = buildCtx();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.resetPassword({ token: "invalid-token", password: "newpassword123" })
    ).rejects.toThrow("This reset link is invalid or has expired.");
  });

  it("updates password and marks token used for valid token", async () => {
    const mockToken = {
      id: 1,
      userId: 42,
      token: "valid-token-abc",
      expiresAt: new Date(Date.now() + 3600000),
      usedAt: null,
      createdAt: new Date(),
    };
    vi.mocked(getValidPasswordResetToken).mockResolvedValue(mockToken);
    vi.mocked(updateUserPassword).mockResolvedValue(undefined);
    vi.mocked(markPasswordResetTokenUsed).mockResolvedValue(undefined);

    const { ctx } = buildCtx();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.resetPassword({
      token: "valid-token-abc",
      password: "newpassword123",
    });

    expect(result).toEqual({ success: true });
    expect(updateUserPassword).toHaveBeenCalledWith(42, expect.any(String));
    expect(markPasswordResetTokenUsed).toHaveBeenCalledWith("valid-token-abc");
  });
});
