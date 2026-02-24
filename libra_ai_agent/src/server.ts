
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { agentRouter } from "./routes/agent";
import { googleAuthRouter } from "./routes/googleAuth";
import { driveRouter } from "./routes/drive";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_, res) => res.json({ ok: true }));
app.use("/agent", agentRouter);
app.use("/drive", driveRouter);
app.use("/auth/google", googleAuthRouter);

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Express server running on http://localhost:${port}`);
});