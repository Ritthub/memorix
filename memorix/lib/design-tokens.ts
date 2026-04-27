export const tokens = {
  bg: {
    base: '#0F172A',
    surface: '#1E293B',
    elevated: '#334155',
    overlay: '#0B1120',
  },
  text: {
    primary: '#F1F5F9',
    secondary: '#94A3B8',
    muted: '#64748B',
    hint: '#475569',
  },
  accent: {
    base: '#4338CA',
    hover: '#3730A3',
    light: '#818CF8',
    subtle: '#312E81',
    muted: '#C7D2FE',
  },
  border: {
    subtle: '#1E293B',
    default: '#334155',
    focus: '#818CF8',
  },
  semantic: {
    again: { bg: '#2D1515', text: '#FCA5A5', border: '#991B1B' },
    hard:  { bg: '#1E293B', text: '#94A3B8', border: '#334155' },
    good:  { bg: '#0C4A6E', text: '#BAE6FD', border: '#0369A1' },
    easy:  { bg: '#312E81', text: '#C7D2FE', border: '#4338CA' },
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#F87171',
    streak: '#06B6D4',
  },
  radius: {
    sm: '8px', md: '12px', lg: '16px', xl: '20px', full: '9999px',
  },
} as const
