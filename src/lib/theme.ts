// Feature: show-up-2-move
// Design tokens shared across the app.
//
// These tokens are intentionally plain JS — components can spread them into
// inline styles and CSS-in-JS objects without a build step. They are paired
// with a matching set of CSS custom properties in `src/styles/global.css`
// so static stylesheets (body, form controls, keyframes) can use the same
// values.

export const colors = {
  // Brand — saturated sunset gradient (primary → accent) anchored by deep ink.
  brand: {
    50: '#eef3ff',
    100: '#dbe5ff',
    200: '#bccdff',
    300: '#94adff',
    400: '#6b87ff',
    500: '#4f63ff', // primary
    600: '#3b47e6',
    700: '#2f38bd',
    800: '#222893',
    900: '#161a66',
  },
  accent: {
    300: '#ffc4ad',
    400: '#ff9f7d',
    500: '#ff7a4d', // accent
    600: '#e65b2e',
    700: '#b3431f',
  },
  // Neutrals — warm grey scale.
  ink: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  },
  success: {
    100: '#dcfce7',
    300: '#86efac',
    500: '#22c55e',
    700: '#15803d',
    900: '#14532d',
  },
  warning: {
    100: '#fef3c7',
    300: '#fcd34d',
    500: '#f59e0b',
    700: '#b45309',
    900: '#78350f',
  },
  danger: {
    100: '#fee2e2',
    300: '#fca5a5',
    500: '#ef4444',
    700: '#b91c1c',
    900: '#7f1d1d',
  },
  info: {
    100: '#dbeafe',
    300: '#93c5fd',
    500: '#3b82f6',
    700: '#1d4ed8',
  },
  surface: '#ffffff',
  surfaceMuted: '#f8fafc',
  surfaceElevated: '#ffffff',
  backdrop: 'rgba(15, 23, 42, 0.55)',
  overlay: 'rgba(15, 23, 42, 0.08)',
} as const

export const gradients = {
  brandSoft:
    'linear-gradient(135deg, rgba(79,99,255,0.12) 0%, rgba(255,122,77,0.10) 100%)',
  brandStrong:
    'linear-gradient(135deg, #4f63ff 0%, #7a5bff 45%, #ff7a4d 100%)',
  brandBg:
    'radial-gradient(1200px 600px at -10% -10%, rgba(79,99,255,0.18), transparent 60%),\n' +
    '     radial-gradient(1000px 500px at 110% 10%, rgba(255,122,77,0.16), transparent 60%),\n' +
    '     linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)',
  cardGloss:
    'linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.6) 100%)',
} as const

export const radii = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  pill: '999px',
} as const

export const spacing = {
  0: '0',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const

export const shadows = {
  xs: '0 1px 2px rgba(15, 23, 42, 0.06)',
  sm: '0 2px 6px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15,23,42,0.04)',
  md: '0 10px 20px -6px rgba(15, 23, 42, 0.08), 0 3px 6px -2px rgba(15,23,42,0.05)',
  lg: '0 20px 40px -12px rgba(15, 23, 42, 0.18), 0 4px 10px -4px rgba(15,23,42,0.08)',
  xl: '0 30px 60px -24px rgba(15, 23, 42, 0.28)',
  focus: '0 0 0 3px rgba(79, 99, 255, 0.35)',
} as const

export const typography = {
  fontFamily:
    '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  size: {
    xs: '0.75rem',
    sm: '0.875rem',
    md: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
    '5xl': '3rem',
  },
  lineHeight: {
    tight: 1.15,
    snug: 1.3,
    normal: 1.5,
    relaxed: 1.7,
  },
} as const

// Per-sport accent color helpers — used for event cards, chat headers, etc.
export const sportTheme: Record<
  string,
  { bg: string; solid: string; text: string; glow: string; emoji: string }
> = {
  football: {
    bg: 'linear-gradient(135deg, #e7fbee 0%, #dcf5e6 100%)',
    solid: '#16a34a',
    text: '#065f46',
    glow: 'rgba(22, 163, 74, 0.22)',
    emoji: '⚽',
  },
  basketball: {
    bg: 'linear-gradient(135deg, #fff2e4 0%, #ffe3c8 100%)',
    solid: '#ea580c',
    text: '#7c2d12',
    glow: 'rgba(234, 88, 12, 0.22)',
    emoji: '🏀',
  },
  tennis: {
    bg: 'linear-gradient(135deg, #fef9c3 0%, #fde68a 100%)',
    solid: '#ca8a04',
    text: '#713f12',
    glow: 'rgba(202, 138, 4, 0.22)',
    emoji: '🎾',
  },
  volleyball: {
    bg: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
    solid: '#0284c7',
    text: '#075985',
    glow: 'rgba(2, 132, 199, 0.22)',
    emoji: '🏐',
  },
} as const

export function themeForSport(sport: string) {
  const key = sport.toLowerCase()
  return (
    sportTheme[key] ?? {
      bg: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)',
      solid: '#4f46e5',
      text: '#312e81',
      glow: 'rgba(79, 70, 229, 0.22)',
      emoji: '🏅',
    }
  )
}
