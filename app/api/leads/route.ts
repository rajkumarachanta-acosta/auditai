import { NextRequest, NextResponse } from "next/server";
import { readLeads, upsertLead, isDuplicate, alreadyContacted } from "@/lib/leads/store";
import { Lead } from "@/lib/leads/types";

export async function GET() {
  const leads = readLeads();
  return NextResponse.json({ leads });
}

export async function POST(req: NextRequest) {
  try {
    const lead = (await req.json()) as Lead;
    if (!lead.company || !lead.website) {
      return NextResponse.json({ error: "Missing company or website" }, { status: 400 });
    }

    const existing = readLeads();
    if (isDuplicate(existing, lead.website, lead.person?.name)) {
      return NextResponse.json({ error: "Duplicate lead — company/person already in pool" }, { status: 409 });
    }

    const leads = upsertLead(lead);
    return NextResponse.json({
      lead,
      previouslyContacted: alreadyContacted(existing, lead.website),
      total: leads.length,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to save lead" }, { status: 500 });
  }
}
