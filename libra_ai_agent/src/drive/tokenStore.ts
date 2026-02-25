import { prisma } from "../../lib/prisma";

const STATE_TTL_MS = 10 * 60 * 1000;

export async function ensureUser(userId: string) {
  return prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId },
  });
}

export async function saveOAuthState(state: string, userId: string) {
  // Clean expired states
  await prisma.oAuthState.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - STATE_TTL_MS) } },
  });
  await prisma.oAuthState.create({ data: { state, userId } });
}

export async function consumeOAuthState(state: string): Promise<string | null> {
  const entry = await prisma.oAuthState.findUnique({ where: { state } });
  if (!entry) return null;
  await prisma.oAuthState.delete({ where: { state } });
  if (Date.now() - entry.createdAt.getTime() > STATE_TTL_MS) return null;
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