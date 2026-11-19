// Sending stored bytes with content type and cache headers.
import type { FastifyReply } from "fastify";

/** For content addressed by an immutable ID (image files, versioned built-in templates). */
export const immutableCache = "public, max-age=31536000, immutable";
/** For content that may change without its URL changing. */
export const revalidateCache = "no-cache";

export const sendBytes = (
  reply: FastifyReply,
  bytes: Buffer,
  mediaType: string,
  cacheControl: string,
): FastifyReply =>
  reply
    .type(mediaType)
    .header("cache-control", cacheControl)
    .header("x-content-type-options", "nosniff")
    .send(bytes);
