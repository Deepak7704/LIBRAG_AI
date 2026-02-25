import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";

declare global {
    namespace Express {
        interface Request {
            userId?: string;
        }
    }
}

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
    const token = (req as any).cookies?.session;
    if (token) {
        try {
            const { userId } = await verifyToken(token);
            req.userId = userId;
        } catch { }
    }
    next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
    const token = (req as any).cookies?.session;
    if (!token) {
        res.status(401).json({ error: "Not authenticated" });
        return;
    }

    try {
        const { userId } = await verifyToken(token);
        req.userId = userId;
        next();
    } catch {
        res.status(401).json({ error: "Invalid or expired session" });
    }
}
