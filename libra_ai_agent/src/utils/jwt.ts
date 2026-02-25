const SECRET = () => {
    const s = process.env.JWT_SECRET;
    if (!s) throw new Error("Missing JWT_SECRET in environment");
    return s;
};

export async function signToken(userId: string): Promise<string> {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ userId, iat: Math.floor(Date.now() / 1000) })).toString("base64url");

    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(SECRET()) as any,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${payload}`) as any);
    const signature = Buffer.from(sig).toString("base64url");

    return `${header}.${payload}.${signature}`;
}

export async function verifyToken(token: string): Promise<{ userId: string }> {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) throw new Error("Invalid token format");

    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(SECRET()) as any,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${payload}`) as any);
    const expectedSig = Buffer.from(expected).toString("base64url");

    if (signature !== expectedSig) throw new Error("Invalid token signature");

    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data.userId) throw new Error("Token missing userId");

    return { userId: data.userId };
}
