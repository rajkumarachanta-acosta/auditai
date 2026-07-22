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

export default function ProfilePage() {
  const [form, setForm] = useState<ProfileForm>(empty);
  const [saved, setSaved] = useState(false);
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
    setSaved(false);
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
    setSaved(true);
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

  const input = "w-full rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-sm dark:border-neutral-700";
  const label = "block text-sm font-medium mb-1";

  return (
    <div className="max-w-2xl space-y-8">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Your profile</h2>
        <p className="text-sm text-neutral-500">
          This drives what the agent searches for and how it scores matches. Comma-separate list fields.
        </p>

        <div>
          <label className={label}>Target job titles</label>
          <input className={input} value={form.target_titles} onChange={(e) => setForm({ ...form, target_titles: e.target.value })} placeholder="Senior Data Analyst, Product Manager" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Seniority</label>
            <input className={input} value={form.seniority} onChange={(e) => setForm({ ...form, seniority: e.target.value })} placeholder="Senior" />
          </div>
          <div>
            <label className={label}>Years of experience</label>
            <input className={input} type="number" value={form.years_experience} onChange={(e) => setForm({ ...form, years_experience: e.target.value })} />
          </div>
        </div>
        <div>
          <label className={label}>Key skills</label>
          <input className={input} value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="SQL, Python, Tableau" />
        </div>
        <div>
          <label className={label}>Locations / countries you&apos;d work in</label>
          <input className={input} value={form.locations} onChange={(e) => setForm({ ...form, locations: e.target.value })} placeholder="United States, Canada, Remote" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.remote_only} onChange={(e) => setForm({ ...form, remote_only: e.target.checked })} />
          Remote only
        </label>

        <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800 space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.visa_sponsorship_needed}
              onChange={(e) => setForm({ ...form, visa_sponsorship_needed: e.target.checked })}
            />
            I need visa/work-permit sponsorship
          </label>
          {form.visa_sponsorship_needed && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>From country</label>
                <input className={input} value={form.visa_from_country} onChange={(e) => setForm({ ...form, visa_from_country: e.target.value })} placeholder="India" />
              </div>
              <div>
                <label className={label}>Target countries</label>
                <input className={input} value={form.visa_to_countries} onChange={(e) => setForm({ ...form, visa_to_countries: e.target.value })} placeholder="United States, Canada" />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Salary floor</label>
            <input className={input} type="number" value={form.salary_floor} onChange={(e) => setForm({ ...form, salary_floor: e.target.value })} />
          </div>
          <div>
            <label className={label}>Currency</label>
            <input className={input} value={form.salary_currency} onChange={(e) => setForm({ ...form, salary_currency: e.target.value })} />
          </div>
        </div>
        <div>
          <label className={label}>Exclude companies</label>
          <input className={input} value={form.excluded_companies} onChange={(e) => setForm({ ...form, excluded_companies: e.target.value })} placeholder="Current or past employer" />
        </div>
        <div>
          <label className={label}>Exclude if description mentions</label>
          <input className={input} value={form.excluded_keywords} onChange={(e) => setForm({ ...form, excluded_keywords: e.target.value })} placeholder="unpaid, commission only" />
        </div>
        <div>
          <label className={label}>Resume (paste text)</label>
          <textarea className={input} rows={8} value={form.resume_text} onChange={(e) => setForm({ ...form, resume_text: e.target.value })} />
        </div>

        <button onClick={save} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          Save profile
        </button>
        {saved && <span className="ml-3 text-sm text-green-600">Saved.</span>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Target companies</h2>
        <p className="text-sm text-neutral-500">
          Companies whose career pages the collector polls directly. Add more by finding the company&apos;s ATS: for
          Greenhouse/Lever, it&apos;s usually the slug in their careers URL. For Workday, open the careers page,
          watch the Network tab for a request to <code>*/wday/cxs/*/jobs</code>, and read the tenant/dc/site off that URL.
        </p>
        <ul className="space-y-1 text-sm">
          {companies.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-1.5 dark:border-neutral-800">
              <span>
                {c.display_name || c.token} <span className="text-neutral-500">({c.ats})</span>
              </span>
              <button onClick={() => removeCompany(c.id)} className="text-red-600 hover:underline">
                remove
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 items-end">
          <select className={input + " w-auto"} value={newCompany.ats} onChange={(e) => setNewCompany({ ...newCompany, ats: e.target.value })}>
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
            <option value="workday">Workday</option>
          </select>
          <input className={input + " w-auto"} placeholder="token / tenant" value={newCompany.token} onChange={(e) => setNewCompany({ ...newCompany, token: e.target.value })} />
          {newCompany.ats === "workday" && (
            <>
              <input className={input + " w-auto"} placeholder="dc (e.g. wd5)" value={newCompany.workday_dc} onChange={(e) => setNewCompany({ ...newCompany, workday_dc: e.target.value })} />
              <input className={input + " w-auto"} placeholder="site" value={newCompany.workday_site} onChange={(e) => setNewCompany({ ...newCompany, workday_site: e.target.value })} />
            </>
          )}
          <input className={input + " w-auto"} placeholder="display name" value={newCompany.display_name} onChange={(e) => setNewCompany({ ...newCompany, display_name: e.target.value })} />
          <button onClick={addCompany} className="rounded-md border px-3 py-1.5 text-sm dark:border-neutral-700">
            Add
          </button>
        </div>
      </section>
    </div>
  );
}
