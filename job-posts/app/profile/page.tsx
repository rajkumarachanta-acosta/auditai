"use client";

import { useEffect, useState } from "react";

interface ProfileForm {
  target_titles: string;
  skills: string;
  years_experience: string;
  seniority: string;
  locations: string;
  remote_only: boolean;
  visa_sponsorship_needed: boolean;
  visa_from_country: string;
  visa_to_countries: string;
  salary_floor: string;
  salary_currency: string;
  excluded_companies: string;
  excluded_keywords: string;
  resume_text: string;
}

const empty: ProfileForm = {
  target_titles: "",
  skills: "",
  years_experience: "",
  seniority: "",
  locations: "",
  remote_only: false,
  visa_sponsorship_needed: false,
  visa_from_country: "",
  visa_to_countries: "",
  salary_floor: "",
  salary_currency: "USD",
  excluded_companies: "",
  excluded_keywords: "",
  resume_text: "",
};

function arr(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

interface Company {
  id: number;
  ats: string;
  token: string;
  workday_dc: string | null;
  workday_site: string | null;
  display_name: string | null;
}

const inputStyle = "w-full rounded-lg px-3 py-2 text-sm outline-none";
const inputBorder = { background: "var(--surface-1)", border: "1px solid var(--border)" };
const label = "mb-1 block text-sm font-medium";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="surface-card rounded-xl p-5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {description && (
        <p className="mt-1 text-sm" style={{ color: "var(--ink-muted)" }}>
          {description}
        </p>
      )}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export default function ProfilePage() {
  const [form, setForm] = useState<ProfileForm>(empty);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [newCompany, setNewCompany] = useState({ ats: "greenhouse", token: "", workday_dc: "", workday_site: "", display_name: "" });

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        const p = data.profile;
        if (!p) return;
        setForm({
          target_titles: (p.target_titles || []).join(", "),
          skills: (p.skills || []).join(", "),
          years_experience: p.years_experience?.toString() ?? "",
          seniority: p.seniority ?? "",
          locations: (p.locations || []).join(", "),
          remote_only: p.remote_only ?? false,
          visa_sponsorship_needed: p.visa_sponsorship_needed ?? false,
          visa_from_country: p.visa_from_country ?? "",
          visa_to_countries: (p.visa_to_countries || []).join(", "),
          salary_floor: p.salary_floor?.toString() ?? "",
          salary_currency: p.salary_currency ?? "USD",
          excluded_companies: (p.excluded_companies || []).join(", "),
          excluded_keywords: (p.excluded_keywords || []).join(", "),
          resume_text: p.resume_text ?? "",
        });
      });
    loadCompanies();
  }, []);

  function loadCompanies() {
    fetch("/api/companies")
      .then((r) => r.json())
      .then((data) => setCompanies(data.companies ?? []));
  }

  async function save() {
    setSaveState("saving");
    await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_titles: arr(form.target_titles),
        skills: arr(form.skills),
        years_experience: form.years_experience ? Number(form.years_experience) : null,
        seniority: form.seniority || null,
        locations: arr(form.locations),
        remote_only: form.remote_only,
        visa_sponsorship_needed: form.visa_sponsorship_needed,
        visa_from_country: form.visa_from_country || null,
        visa_to_countries: arr(form.visa_to_countries),
        salary_floor: form.salary_floor ? Number(form.salary_floor) : null,
        salary_currency: form.salary_currency,
        excluded_companies: arr(form.excluded_companies),
        excluded_keywords: arr(form.excluded_keywords),
        resume_text: form.resume_text || null,
      }),
    });
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 2000);
  }

  async function addCompany() {
    if (!newCompany.token) return;
    await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newCompany),
    });
    setNewCompany({ ats: "greenhouse", token: "", workday_dc: "", workday_site: "", display_name: "" });
    loadCompanies();
  }

  async function removeCompany(id: number) {
    await fetch("/api/companies", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadCompanies();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-16">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--ink-muted)" }}>
          This drives what the agent searches for and how it scores matches.
        </p>
      </div>

      <Section title="Target role" description="Comma-separate multiple entries.">
        <div>
          <label className={label}>Job titles</label>
          <input className={inputStyle} style={inputBorder} value={form.target_titles} onChange={(e) => setForm({ ...form, target_titles: e.target.value })} placeholder="Senior Data Analyst, Product Manager" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Seniority</label>
            <input className={inputStyle} style={inputBorder} value={form.seniority} onChange={(e) => setForm({ ...form, seniority: e.target.value })} placeholder="Senior" />
          </div>
          <div>
            <label className={label}>Years of experience</label>
            <input className={inputStyle} style={inputBorder} type="number" value={form.years_experience} onChange={(e) => setForm({ ...form, years_experience: e.target.value })} />
          </div>
        </div>
        <div>
          <label className={label}>Key skills</label>
          <input className={inputStyle} style={inputBorder} value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="SQL, Python, Tableau" />
        </div>
      </Section>

      <Section title="Location & work authorization">
        <div>
          <label className={label}>Locations / countries you&apos;d work in</label>
          <input className={inputStyle} style={inputBorder} value={form.locations} onChange={(e) => setForm({ ...form, locations: e.target.value })} placeholder="United States, Canada, Remote" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.remote_only} onChange={(e) => setForm({ ...form, remote_only: e.target.checked })} />
          Remote only
        </label>

        <div className="rounded-lg p-3.5" style={{ background: "var(--surface-2)" }}>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.visa_sponsorship_needed}
              onChange={(e) => setForm({ ...form, visa_sponsorship_needed: e.target.checked })}
            />
            I need visa/work-permit sponsorship
          </label>
          {form.visa_sponsorship_needed && (
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <label className={label}>From country</label>
                <input className={inputStyle} style={inputBorder} value={form.visa_from_country} onChange={(e) => setForm({ ...form, visa_from_country: e.target.value })} placeholder="India" />
              </div>
              <div>
                <label className={label}>Target countries</label>
                <input className={inputStyle} style={inputBorder} value={form.visa_to_countries} onChange={(e) => setForm({ ...form, visa_to_countries: e.target.value })} placeholder="United States, Canada" />
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title="Compensation & exclusions">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Salary floor</label>
            <input className={inputStyle} style={inputBorder} type="number" value={form.salary_floor} onChange={(e) => setForm({ ...form, salary_floor: e.target.value })} />
          </div>
          <div>
            <label className={label}>Currency</label>
            <input className={inputStyle} style={inputBorder} value={form.salary_currency} onChange={(e) => setForm({ ...form, salary_currency: e.target.value })} />
          </div>
        </div>
        <div>
          <label className={label}>Exclude companies</label>
          <input className={inputStyle} style={inputBorder} value={form.excluded_companies} onChange={(e) => setForm({ ...form, excluded_companies: e.target.value })} placeholder="Current or past employer" />
        </div>
        <div>
          <label className={label}>Exclude if description mentions</label>
          <input className={inputStyle} style={inputBorder} value={form.excluded_keywords} onChange={(e) => setForm({ ...form, excluded_keywords: e.target.value })} placeholder="unpaid, commission only" />
        </div>
      </Section>

      <Section title="Resume">
        <textarea className={inputStyle} style={inputBorder} rows={8} value={form.resume_text} onChange={(e) => setForm({ ...form, resume_text: e.target.value })} placeholder="Paste resume text here…" />
      </Section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saveState === "saving"}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          {saveState === "saving" ? "Saving…" : "Save profile"}
        </button>
        {saveState === "saved" && (
          <span className="text-sm font-medium" style={{ color: "var(--good)" }}>
            Saved
          </span>
        )}
      </div>

      <Section
        title="Target companies"
        description="Companies whose career pages the collector polls directly. For Greenhouse/Lever, it's usually the slug in their careers URL. For Workday, open the careers page, watch the Network tab for a request to */wday/cxs/*/jobs, and read the tenant/dc/site off that URL."
      >
        <ul className="space-y-1.5">
          {companies.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm" style={{ background: "var(--surface-2)" }}>
              <span>
                {c.display_name || c.token} <span style={{ color: "var(--ink-muted)" }}>({c.ats})</span>
              </span>
              <button onClick={() => removeCompany(c.id)} className="text-sm font-medium" style={{ color: "var(--critical)" }}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <select className={inputStyle + " w-auto"} style={inputBorder} value={newCompany.ats} onChange={(e) => setNewCompany({ ...newCompany, ats: e.target.value })}>
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
            <option value="workday">Workday</option>
          </select>
          <input className={inputStyle + " w-auto"} style={inputBorder} placeholder="token / tenant" value={newCompany.token} onChange={(e) => setNewCompany({ ...newCompany, token: e.target.value })} />
          {newCompany.ats === "workday" && (
            <>
              <input className={inputStyle + " w-auto"} style={inputBorder} placeholder="dc (e.g. wd5)" value={newCompany.workday_dc} onChange={(e) => setNewCompany({ ...newCompany, workday_dc: e.target.value })} />
              <input className={inputStyle + " w-auto"} style={inputBorder} placeholder="site" value={newCompany.workday_site} onChange={(e) => setNewCompany({ ...newCompany, workday_site: e.target.value })} />
            </>
          )}
          <input className={inputStyle + " w-auto"} style={inputBorder} placeholder="display name" value={newCompany.display_name} onChange={(e) => setNewCompany({ ...newCompany, display_name: e.target.value })} />
          <button onClick={addCompany} className="rounded-lg px-3 py-2 text-sm font-medium" style={inputBorder}>
            Add
          </button>
        </div>
      </Section>
    </div>
  );
}
