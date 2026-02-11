import crypto from "crypto";

const UNSUBSCRIBE_SECRET = process.env.OPENAI_API_KEY || "crm-unsubscribe-fallback-secret";

/**
 * Generate an HMAC token for a contact ID to prevent unauthorized unsubscribes.
 */
export function generateUnsubToken(contactId: string): string {
  return crypto
    .createHmac("sha256", UNSUBSCRIBE_SECRET)
    .update(contactId)
    .digest("hex")
    .slice(0, 32); // Short enough for a URL, long enough to be secure
}

/**
 * Verify an HMAC token for a contact ID.
 */
export function verifyUnsubToken(contactId: string, token: string): boolean {
  const expected = generateUnsubToken(contactId);
  return crypto.timingSafeEqual(
    Buffer.from(token, "utf8"),
    Buffer.from(expected, "utf8")
  );
}

/**
 * Build the full unsubscribe URL for a contact.
 */
export function getUnsubscribeUrl(contactId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const token = generateUnsubToken(contactId);
  return `${baseUrl}/api/unsubscribe?contactId=${contactId}&token=${token}`;
}
