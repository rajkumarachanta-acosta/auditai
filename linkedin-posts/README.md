# Weekly LinkedIn Post Engine

A Routine fires every Sunday (target: by 10:00 AM IST) and generates one
LinkedIn post from Rajkumar's Amazon advertising expertise, aimed at
founders and C-suite / brand-owner audiences (not PPC practitioners).

## How it works

1. The fired session reads `history.md` in this folder to see every angle,
   hook, and topic already used — new posts must not repeat a topic or
   reuse a hook structure from the last ~8 weeks.
2. It drafts a new post: strong first-line hook, short paragraphs,
   grounded in a real, specific insight (not generic "5 tips" filler).
   Draws on real patterns from this codebase's audit engine
   (`lib/auditEngine.ts`) — zero-sales keyword waste, ACOS vs. blended
   TACOS, ASIN cohort economics, return-rate risk, spend concentration,
   etc. — translated into an executive-relevant point (P&L, budget
   ownership, growth risk), not tactical bid-management advice.
3. It appends the new post to `history.md` (date, topic/angle, hook, full
   text) and commits + pushes to this branch.
4. It creates a Gmail draft (to rajkumar.achanta@gmail.com) with the post
   text, ready to copy into LinkedIn. (The connected Gmail integration
   only supports drafts, not sending — there's no tool to place mail
   directly into the Inbox.)

## Editorial bar

- Hook in the first line — something a founder would stop scrolling for.
- One clear, specific, non-obvious point. Not a listicle of generic tips.
- Vary structure week to week: contrarian take, short story, framework,
  data-led myth-bust — never the same template twice in a row.
- No engagement bait ("Agree?"), no emoji spam, 3-5 relevant hashtags max.
- 150-250 words. Written to be read on mobile.
