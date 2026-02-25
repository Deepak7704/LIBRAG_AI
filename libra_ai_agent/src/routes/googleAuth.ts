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



googleAuthRouter.get("/start", async (req, res) => {
  const userId = req.query.userId as string | undefined;
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
  const code = (req.query.code as string) ?? "";
  const state = (req.query.state as string) ?? "";

  if (!code || !state) {
    res.status(400).send("Missing code or state");
    return;
  }

  const tempUserId = consumeOAuthState(state);
  if (!tempUserId) {
    res.status(400).send("Invalid OAuth state");
    return;
  }

  const oauth2 = createOAuthClient();
  const { tokens } = await oauth2.getToken(code);

  let canonicalUserId = tempUserId;

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
      const existingUser = await prisma.user.findFirst({ where: { email } });

      if (existingUser && existingUser.id !== tempUserId) {
        canonicalUserId = existingUser.id;

        await prisma.googleAuth.deleteMany({ where: { userId: tempUserId } });
        await prisma.conversation.updateMany({
          where: { userId: tempUserId },
          data: { userId: canonicalUserId },
        });
        await prisma.driveFile.updateMany({
          where: { userId: tempUserId },
          data: { userId: canonicalUserId },
        });
        await prisma.user.deleteMany({ where: { id: tempUserId } });
      } else {
        await prisma.user.update({
          where: { id: canonicalUserId },
          data: { email },
        });
      }
    }
  } catch (e) { console.error("[auth] OAuth callback user merge failed:", e); }

  await upsertGoogleTokens(canonicalUserId, {
    access_token: tokens.access_token ?? null,
    refresh_token: tokens.refresh_token ?? undefined,
    expiry_date: tokens.expiry_date ?? null,
  });

  const base = process.env.APP_BASE_URL || "http://localhost:5173";
  res.redirect(`${base}/?connected=1&userId=${canonicalUserId}`);
});

googleAuthRouter.get("/status", async (req, res) => {
  const userId = req.query.userId as string | undefined;
  if (!userId) {
    res.status(400).json({ error: "userId (string) is required" });
    return;
  }

  const auth = await getGoogleAuth(userId);
  if (!auth || (!auth.accessToken && !auth.refreshToken)) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.email) {
      const existingUser = await prisma.user.findFirst({
        where: { email: user.email },
        include: { googleAuth: true },
      });
      if (existingUser?.googleAuth && existingUser.id !== userId) {
        res.json({ connected: true, email: existingUser.email, canonicalUserId: existingUser.id });
        return;
      }
    }
    res.json({ connected: false });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  res.json({ connected: true, email: user?.email ?? null, canonicalUserId: userId });
});

googleAuthRouter.post("/disconnect", async (req, res) => {
  const userId = req.body?.userId as string | undefined;
  if (!userId) {
    res.status(400).json({ error: "userId (string) is required" });
    return;
  }

  await prisma.googleAuth.deleteMany({ where: { userId } });
  res.json({ ok: true });
});