import type { Response } from "express";

export function initSSE(res: Response) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  res.setHeader("X-Accel-Buffering", "no");

  res.flushHeaders?.();

  const send = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const close = () => {
    res.end();
  };

  return { send, close };
}