import { google } from "googleapis";
import { createOAuthClient } from "./oauth";
import { getGoogleAuth, upsertGoogleTokens } from "./tokenStore";

export async function getOAuthClientForUser(userId: string) {
  const authRow = await getGoogleAuth(userId);
  if (!authRow || (!authRow.accessToken && !authRow.refreshToken)) {
    throw new Error("Google Drive not connected for this user");
  }

  const oauth2 = createOAuthClient();

  oauth2.setCredentials({
    access_token: authRow.accessToken ?? undefined,
    refresh_token: authRow.refreshToken ?? undefined,
    expiry_date: authRow.expiryMs != null ? Number(authRow.expiryMs) : undefined,
  });

  oauth2.on("tokens", async (t) => {
    const access_token = typeof t.access_token === "string" ? t.access_token : null;
    const refresh_token = typeof t.refresh_token === "string" ? t.refresh_token : null;
    const expiry_date = typeof t.expiry_date === "number" ? t.expiry_date : null;

    if (!access_token && !refresh_token && expiry_date == null) return;

    await upsertGoogleTokens(userId, {
      access_token,
      refresh_token,
      expiry_date,
    });
  });

  return oauth2;
}

export async function getDriveClient(userId: string) {
  const oauth2 = await getOAuthClientForUser(userId);
  return google.drive({ version: "v3", auth: oauth2 });
}