import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface AuthUserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  updatedAt: string;
  lastSignedInAt: string | null;
}

export interface AuthUserSessionView {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  lastSignedInAt: string | null;
}

type AuthStoreState = {
  version: 1;
  users: AuthUserRecord[];
};

type AuthSession = {
  token: string;
  userId: string;
  expiresAt: number;
};

const STORE_DIR = path.resolve(process.cwd(), "data");
const STORE_PATH = path.join(STORE_DIR, "veritas-auth-store.json");
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeEmail(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

function emptyState(): AuthStoreState {
  return {
    version: 1,
    users: [],
  };
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function verifyPassword(password: string, user: AuthUserRecord): boolean {
  const expected = Buffer.from(user.passwordHash, "hex");
  const actual = Buffer.from(hashPassword(password, user.passwordSalt), "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function sessionView(user: AuthUserRecord): AuthUserSessionView {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
    lastSignedInAt: user.lastSignedInAt,
  };
}

export class LocalAuthStore {
  private state: AuthStoreState;
  private readonly sessions = new Map<string, AuthSession>();

  constructor(private readonly storePath = STORE_PATH) {
    this.state = this.load();
  }

  private load(): AuthStoreState {
    if (!fs.existsSync(this.storePath)) {
      return emptyState();
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.storePath, "utf8")) as Partial<AuthStoreState>;
      return {
        version: 1,
        users: Array.isArray(parsed.users) ? parsed.users as AuthUserRecord[] : [],
      };
    } catch {
      return emptyState();
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(this.state, null, 2), "utf8");
  }

  private pruneSessions(): void {
    const now = Date.now();
    for (const [token, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(token);
      }
    }
  }

  hasUsers(): boolean {
    return this.state.users.length > 0;
  }

  signUp(input: { email: string; displayName: string; password: string }): AuthUserSessionView {
    const email = normalizeEmail(input.email);
    const displayName = String(input.displayName ?? "").trim();
    const password = String(input.password ?? "");

    if (!email || !email.includes("@")) {
      throw new Error("Enter a valid email address.");
    }
    if (!displayName) {
      throw new Error("Display name is required.");
    }
    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
    if (this.state.users.some((user) => user.email === email)) {
      throw new Error("An account already exists for that email.");
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const timestamp = nowIso();
    const user: AuthUserRecord = {
      id: `auth_${crypto.randomUUID()}`,
      email,
      displayName,
      passwordSalt: salt,
      passwordHash: hashPassword(password, salt),
      createdAt: timestamp,
      updatedAt: timestamp,
      lastSignedInAt: timestamp,
    };

    this.state.users.push(user);
    this.save();
    return sessionView(user);
  }

  signIn(input: { email: string; password: string }): AuthUserSessionView {
    const email = normalizeEmail(input.email);
    const password = String(input.password ?? "");
    const user = this.state.users.find((entry) => entry.email === email);
    if (!user || !verifyPassword(password, user)) {
      throw new Error("Email or password was not recognized.");
    }

    user.lastSignedInAt = nowIso();
    user.updatedAt = user.lastSignedInAt;
    this.save();
    return sessionView(user);
  }

  createSession(userId: string): string {
    this.pruneSessions();
    const token = crypto.randomBytes(24).toString("hex");
    this.sessions.set(token, {
      token,
      userId,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    return token;
  }

  userById(userId: string): AuthUserSessionView | null {
    const user = this.state.users.find((entry) => entry.id === userId);
    return user ? sessionView(user) : null;
  }

  sessionUser(token: string | null | undefined): AuthUserSessionView | null {
    if (!token) return null;
    this.pruneSessions();
    const session = this.sessions.get(token);
    if (!session) return null;
    return this.userById(session.userId);
  }

  revokeSession(token: string | null | undefined): void {
    if (!token) return;
    this.sessions.delete(token);
  }
}

export const localAuthStore = new LocalAuthStore();
