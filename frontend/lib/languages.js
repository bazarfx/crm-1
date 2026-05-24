// Canonical language list for the CRM. Source of truth for both the create-
// user form and the language pills on the Users / Dashboard / Leads surfaces.
// Add a new language? Add it here, give it a color in LANGUAGE_COLORS, and the
// rest of the UI picks it up automatically.

export const LANGUAGES = [
  { value: 'english',   label: 'English' },
  { value: 'tamil',     label: 'Tamil' },
  { value: 'telugu',    label: 'Telugu' },
  { value: 'hindi',     label: 'Hindi' },
  { value: 'marathi',   label: 'Marathi' },
  { value: 'gujarati',  label: 'Gujarati' },
  { value: 'bengali',   label: 'Bengali' },
  { value: 'kannada',   label: 'Kannada' },
  { value: 'malayalam', label: 'Malayalam' },
  { value: 'punjabi',   label: 'Punjabi' },
];

// Dark-aware tints. The `text` shade is the dark-mode default; LanguageBadge
// flips it for light mode via Tailwind's `dark:` modifier when composing the
// final className. Keep these in sync with the CLAUDE.md status palette
// vibes — saturated but never neon.
export const LANGUAGE_COLORS = {
  english:   { bg: 'bg-blue-500/15',    text: 'text-blue-700 dark:text-blue-300',       border: 'border-blue-500/30' },
  tamil:     { bg: 'bg-purple-500/15',  text: 'text-purple-700 dark:text-purple-300',   border: 'border-purple-500/30' },
  telugu:    { bg: 'bg-teal-500/15',    text: 'text-teal-700 dark:text-teal-300',       border: 'border-teal-500/30' },
  hindi:     { bg: 'bg-amber-500/15',   text: 'text-amber-700 dark:text-amber-300',     border: 'border-amber-500/30' },
  marathi:   { bg: 'bg-pink-500/15',    text: 'text-pink-700 dark:text-pink-300',       border: 'border-pink-500/30' },
  gujarati:  { bg: 'bg-rose-500/15',    text: 'text-rose-700 dark:text-rose-300',       border: 'border-rose-500/30' },
  bengali:   { bg: 'bg-indigo-500/15',  text: 'text-indigo-700 dark:text-indigo-300',   border: 'border-indigo-500/30' },
  kannada:   { bg: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-500/30' },
  malayalam: { bg: 'bg-sky-500/15',     text: 'text-sky-700 dark:text-sky-300',         border: 'border-sky-500/30' },
  punjabi:   { bg: 'bg-orange-500/15',  text: 'text-orange-700 dark:text-orange-300',   border: 'border-orange-500/30' },
};

const FALLBACK = {
  bg: 'bg-slate-500/15',
  text: 'text-slate-700 dark:text-slate-300',
  border: 'border-slate-500/30',
};

export const labelFor = (lang) =>
  LANGUAGES.find((l) => l.value === lang)?.label
  || (lang ? lang.charAt(0).toUpperCase() + lang.slice(1) : '—');

export const colorsFor = (lang) => LANGUAGE_COLORS[lang] || FALLBACK;
