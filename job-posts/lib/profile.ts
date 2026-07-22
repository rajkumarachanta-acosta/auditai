export interface Profile {
  target_titles: string[];
  skills: string[];
  years_experience: number | null;
  seniority: string | null;
  locations: string[];
  remote_only: boolean;
  visa_sponsorship_needed: boolean;
  visa_from_country: string | null;
  visa_to_countries: string[];
  salary_floor: number | null;
  salary_currency: string;
  excluded_companies: string[];
  excluded_keywords: string[];
  resume_text: string | null;
}

export const emptyProfile: Profile = {
  target_titles: [],
  skills: [],
  years_experience: null,
  seniority: null,
  locations: [],
  remote_only: false,
  visa_sponsorship_needed: false,
  visa_from_country: null,
  visa_to_countries: [],
  salary_floor: null,
  salary_currency: "USD",
  excluded_companies: [],
  excluded_keywords: [],
  resume_text: null,
};
