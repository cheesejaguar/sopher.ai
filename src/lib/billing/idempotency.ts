import { z } from "zod";

export class InvalidIdempotencyKeyError extends Error {
  constructor() {
    super("A valid Idempotency-Key header is required for paid work");
    this.name = "InvalidIdempotencyKeyError";
  }
}

/** Caller-stable UUID for one intentional paid interaction. */
export function requireIdempotencyKey(req: Request): string {
  const parsed = z.uuid().safeParse(req.headers.get("idempotency-key"));
  if (!parsed.success) throw new InvalidIdempotencyKeyError();
  return parsed.data;
}
