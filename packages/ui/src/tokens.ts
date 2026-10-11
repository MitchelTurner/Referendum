export const tokens = {
  color: {
    paper: '#FBFAF5',
    buff: '#F2E6C4',
    buffLine: '#E0D2A8',
    water: '#DCEBF4',
    waterLine: '#B9D3E4',
    ink: '#0B2545',
    inkMuted: '#3D4F63',
    chartBlue: '#1F5A8A',
    hazard: '#A3157F',
    hazardTint: '#F8E6F2',
    hazardInk: '#6E0E55',
    rule: '#D9DED9',
    gov: { city: '#1F5A8A', borough: '#0B2545', saxman: '#8A6416', school: '#8C979F' },
  },
  font: {
    display: '"Bricolage Grotesque", sans-serif',
    body: '"Atkinson Hyperlegible", sans-serif',
    mono: '"IBM Plex Mono", monospace',
  },
  radius: { sm: 4, md: 6, lg: 8 },
} as const;

export type GovToken = keyof typeof tokens.color.gov;

export function govColor(token: string): string {
  const key = token.replace('gov.', '') as GovToken;
  return tokens.color.gov[key] ?? tokens.color.ink;
}
