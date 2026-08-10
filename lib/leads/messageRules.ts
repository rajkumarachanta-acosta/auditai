// ── Outreach message validator ──
// Enforces the section 7/8 guardrails: word-count bounds and a banned-phrase
// list for generic sales language. This never generates message text —
// personalization must come from real, sourced evidence — it only checks it.

import { OutreachMessage } from "./types";

const BANNED_PHRASES = [
  "i hope you're doing well",
  "i hope this email finds you well",
  "i wanted to reach out",
  "just wanted to reach out",
  "synergies",
  "circle back",
  "touch base",
  "leverage our",
  "best-in-class",
  "cutting-edge solution",
  "game-changing",
  "revolutionize",
  "i came across your profile",
  "i noticed you're a great fit",
  "unlock your potential",
  "take your business to the next level",
];

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function validateMessage(
  body: string,
  bounds: { min: number; max: number }
): OutreachMessage {
  const issues: string[] = [];
  const count = wordCount(body);

  if (count < bounds.min) issues.push(`Too short: ${count} words (min ${bounds.min})`);
  if (count > bounds.max) issues.push(`Too long: ${count} words (max ${bounds.max})`);

  const lower = body.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) issues.push(`Contains banned phrase: "${phrase}"`);
  }

  return { body, wordCount: count, valid: issues.length === 0, issues };
}

export const EMAIL_BOUNDS = { min: 60, max: 100 };
export const LINKEDIN_BOUNDS = { min: 45, max: 60 };

export function validateEmail(body: string): OutreachMessage {
  return validateMessage(body, EMAIL_BOUNDS);
}

export function validateLinkedinDm(body: string): OutreachMessage {
  return validateMessage(body, LINKEDIN_BOUNDS);
}
