
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authMiddleware } from "./middleware/auth";
import { agentRouter } from "./routes/agent";
import { googleAuthRouter } from "./routes/googleAuth";
import { driveRouter } from "./routes/drive";

dotenv.config();

const app = express();

app.use(cors({
  origin: process.env.APP_BASE_URL || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/health", (_, res) => res.json({ ok: true }));
app.use("/api/auth/google", authMiddleware, googleAuthRouter);
app.use("/api/agent", authMiddleware, agentRouter);
app.use("/api/drive", authMiddleware, driveRouter);

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Express server running on http://localhost:${port}`);
});