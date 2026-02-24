import { prisma } from "../../lib/prisma";

const oauthStates = new Map<string, { userId: string; createdAt: number }>();

const STATE_TTL_MS = 10 * 60 * 1000;

function cleanExpiredStates() {
  const now = Date.now();
  for (const [key, val] of oauthStates) {
    if (now - val.createdAt > STATE_TTL_MS) {
      oauthStates.delete(key);
    }
  }
}

export async function ensureUser(userId: string) {
  return prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId },
  });
}

export function saveOAuthState(state: string, userId: string) {
  cleanExpiredStates();
  oauthStates.set(state, { userId, createdAt: Date.now() });
}

export function consumeOAuthState(state: string): string | null {
  const entry = oauthStates.get(state);
  if (!entry) return null;
  oauthStates.delete(state);
  if (Date.now() - entry.createdAt > STATE_TTL_MS) return null;
  return entry.userId;
}

export async function upsertGoogleTokens(
  userId: string,
  tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
  }
) {
  const existing = await prisma.googleAuth.findUnique({ where: { userId } });

  const expiryMs = tokens.expiry_date != null ? BigInt(tokens.expiry_date) : null;
  const accessToken = tokens.access_token ?? null;
  const refreshToken = tokens.refresh_token ?? null;

  if (!existing) {
    await prisma.googleAuth.create({
      data: { userId, accessToken, refreshToken, expiryMs },
    });
    return;
  }

  const data: any = { accessToken, expiryMs };
  if (tokens.refresh_token) {
    data.refreshToken = tokens.refresh_token;
  }

  await prisma.googleAuth.update({ where: { userId }, data });
}

export async function getGoogleAuth(userId: string) {
  return prisma.googleAuth.findUnique({ where: { userId } });
}