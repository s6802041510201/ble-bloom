export const colors = {
  canvas: '#FFF7FB',
  surface: '#FFFFFF',
  surfaceMuted: '#FFF0F6',
  surfaceStrong: '#FFE3EF',
  ink: '#3A2635',
  inkMuted: '#7C6474',
  inkSoft: '#A48D9D',
  line: '#F2D6E2',
  pink: '#D9578C',
  pinkDark: '#A83B6C',
  pinkSoft: '#F7B7D1',
  coral: '#F0848D',
  lilac: '#CBB8F7',
  mint: '#B9E6D5',
  cream: '#FFF5D6',
  success: '#2D936C',
  warning: '#B9782D',
  danger: '#B7445C',
  white: '#FFFFFF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  full: 999,
} as const;

export const type = {
  eyebrow: {
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 1.2,
    color: colors.pinkDark,
  },
  title: {
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '800' as const,
    color: colors.ink,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500' as const,
    color: colors.inkMuted,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800' as const,
    color: colors.ink,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500' as const,
    color: colors.ink,
  },
  caption: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500' as const,
    color: colors.inkMuted,
  },
} as const;

export const shadows = {
  card: '0 2px 8px rgba(168, 59, 108, 0.08)',
  raised: '0 8px 20px rgba(168, 59, 108, 0.12)',
} as const;
