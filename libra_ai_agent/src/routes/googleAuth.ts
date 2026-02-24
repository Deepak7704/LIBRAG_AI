import { Router } from "express";
import { randomUUID } from "crypto";
import { google } from "googleapis";
import { buildAuthUrl, createOAuthClient } from "../google/oauth";
import {
  consumeOAuthState,
  ensureUser,
  getGoogleAuth,
  saveOAuthState,
  upsertGoogleTokens,
} from "../google/tokenStore";
import { prisma } from "../../lib/prisma";

export const googleAuthRouter = Router();

function qv(v: unknown) {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

googleAuthRouter.get("/start", async (req, res) => {
  const userId = qv((req as any).query?.userId);
  if (!userId) {
    res.status(400).json({ error: "userId (string) is required" });
    return;
  }

  await ensureUser(userId);

  const state = randomUUID();
  saveOAuthState(state, userId);

  res.redirect(buildAuthUrl(state));
});

googleAuthRouter.get("/callback", async (req, res) => {
  const code = qv((req as any).query?.code) ?? "";
  const state = qv((req as any).query?.state) ?? "";

  if (!code || !state) {
    res.status(400).send("Missing code or state");
    return;
  }

  const userId = consumeOAuthState(state);
  if (!userId) {
    res.status(400).send("Invalid OAuth state");
    return;
  }

  const oauth2 = createOAuthClient();
  const { tokens } = await oauth2.getToken(code);

  await upsertGoogleTokens(userId, {
    access_token: tokens.access_token ?? null,
    refresh_token: tokens.refresh_token ?? undefined,
    expiry_date: tokens.expiry_date ?? null,
  });

  try {
    oauth2.setCredentials({
      access_token: tokens.access_token ?? undefined,
      refresh_token: tokens.refresh_token ?? undefined,
      expiry_date: tokens.expiry_date ?? undefined,
    });

    const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
    const me = await oauth2Api.userinfo.get();

    const email = me.data.email ?? null;
    if (email) {
      await prisma.user.update({
        where: { id: userId },
        data: { email },
      });
    }
  } catch { }

  const base = process.env.APP_BASE_URL || "http://localhost:5173";
  res.redirect(`${base}/?connected=1`);
});

googleAuthRouter.get("/status", async (req, res) => {
  const userId = qv((req as any).query?.userId);
  if (!userId) {
    res.status(400).json({ error: "userId (string) is required" });
    return;
  }

  const auth = await getGoogleAuth(userId);
  if (!auth || (!auth.accessToken && !auth.refreshToken)) {
    res.json({ connected: false });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  res.json({ connected: true, email: user?.email ?? null });
});

googleAuthRouter.post("/disconnect", async (req, res) => {
  const userId = qv((req as any).body?.userId);
  if (!userId) {
    res.status(400).json({ error: "userId (string) is required" });
    return;
  }

  await prisma.googleAuth.deleteMany({ where: { userId } });
  res.json({ ok: true });
});