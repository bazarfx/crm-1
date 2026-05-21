const { fontFamily } = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './hooks/**/*.{js,jsx,ts,tsx}',
    './lib/**/*.{js,jsx,ts,tsx}',
    './store/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'DM Sans', ...fontFamily.sans],
        mono: ['var(--font-dm-mono)', 'DM Mono', ...fontFamily.mono],
      },
      fontSize: {
        xs: ['11px', '16px'],
        sm: ['13px', '18px'],
        base: ['14px', '20px'],
        lg: ['16px', '24px'],
        xl: ['20px', '28px'],
        '2xl': ['28px', '36px'],
        '3xl': ['36px', '44px'],
      },
      colors: {
        /* ---------- shadcn HSL tokens ---------- */
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },

        /* ---------- Legacy CRM tokens (kept) ---------- */
        sidebar: {
          DEFAULT: '#0B1120',
          bg: '#0B1120',
          hover: '#141E30',
          'active-bg': '#1E3A5F',
          'active-border': '#4F8EF7',
          text: '#94A3B8',
          'text-active': '#FFFFFF',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          alt: '#F8FAFC',
          main: '#F0F4FA',
        },
        line: {
          DEFAULT: '#E2E8F0',
          strong: '#CBD5E1',
        },
        ink: {
          primary: '#0F172A',
          secondary: '#475569',
          muted: '#94A3B8',
        },
        accent: {
          DEFAULT: '#4F8EF7',
          hover: '#3B7CE8',
          glow: 'rgba(79,142,247,0.15)',
          foreground: 'hsl(var(--accent-foreground))',
        },
        status: {
          new: '#6366F1',
          contacted: '#3B82F6',
          interested: '#8B5CF6',
          'not-interested': '#EF4444',
          'call-back': '#F59E0B',
          'account-opened': '#14B8A6',
          'ftd-done': '#10B981',
          cold: '#6B7280',
          dnd: '#DC2626',
          inactive: '#9CA3AF',
          reactive: '#F97316',
        },
      },
      borderRadius: {
        xl: '16px',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        sm: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        md: '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
        lg: '0 20px 40px rgba(0,0,0,0.10)',
        glow: '0 0 0 4px rgba(79,142,247,0.15)',
      },
      transitionDuration: {
        150: '150ms',
      },
      keyframes: {
        modalIn: {
          from: { opacity: '0', transform: 'scale(0.95) translateY(8px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        skeletonPulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        toastIn: {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        modalIn: 'modalIn 200ms ease forwards',
        skeleton: 'skeletonPulse 2s cubic-bezier(.4,0,.6,1) infinite',
        toastIn: 'toastIn 180ms ease forwards',
        shimmer: 'shimmer 1.5s infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
