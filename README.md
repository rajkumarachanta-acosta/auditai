# AuditAI — Campaign Intelligence Chatbot

An AI-powered chatbot for Amazon advertising campaign audits. Upload your campaign data and ask questions in plain English. Generate PowerPoint presentations instantly.

## Features

- **Upload & Analyze** — drag & drop Excel/CSV files (Sales, Traffic, Campaign, Search Term reports)
- **Smart Chat** — ask questions like "What's wasting budget?" or "Which keywords should I pause?"
- **Zero Hallucinations** — Python-style audit engine computes all facts; LLM only formats language
- **PowerPoint Export** — 8-slide presentation generated from your data in one click
- **Privacy First** — your data never leaves your browser (processed client-side)
- **Optional OpenAI** — works without an API key; add one for enhanced natural language responses

## One-Link Deploy (Vercel)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/auditai)

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Supported File Types

| File | What it provides |
|------|-----------------|
| Sales Report (`.xlsx`) | ASIN-level sales, units, revenue |
| Traffic Report (`.xlsx`) | Sessions, page views, CVR |
| Campaign Report (`.xlsx`) | Keywords, bids, ACOS, spend, CTR |
| Search Term Report (`.xlsx`) | Query-level performance |

## Tech Stack

- **Next.js 16** (App Router)
- **SheetJS** — client-side Excel parsing
- **PptxGenJS** — PowerPoint generation
- **OpenAI API** (optional) — gpt-3.5-turbo for language enhancement
- **Vercel** — one-click deployment
