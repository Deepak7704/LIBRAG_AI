import { serve } from "bun";
import index from "./index.html";

const port = Number(process.env.PORT || 5173);
const API_TARGET = process.env.NEXT_PUBLIC_API_URL + "/api" || "http://localhost:3000";

const server = serve({
  port,
  routes: {
    "/api/*": async (req) => {
      const url = new URL(req.url);
      const target = `${API_TARGET}${url.pathname.replace("/api", "")}${url.search}`;
      const headers = new Headers(req.headers);
      headers.set("host", new URL(API_TARGET).host);
      return fetch(target, {
        method: req.method,
        headers,
        body: req.body,
        redirect: "manual",
      });
    },
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
