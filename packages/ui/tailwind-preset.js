/** Tailwind preset. Light theme only — no dark mode variant. */
module.exports = {
  theme: {
    extend: {
      colors: {
        paper: '#FBFAF5',
        buff: '#F2E6C4',
        'buff-line': '#E0D2A8',
        water: '#DCEBF4',
        'water-line': '#B9D3E4',
        ink: '#0B2545',
        'ink-muted': '#3D4F63',
        'chart-blue': '#1F5A8A',
        hazard: '#A3157F',
        'hazard-tint': '#F8E6F2',
        'hazard-ink': '#6E0E55',
        rule: '#D9DED9',
        'gov-city': '#1F5A8A',
        'gov-borough': '#0B2545',
        'gov-saxman': '#8A6416',
        'gov-school': '#8C979F',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'sans-serif'],
        body: ['"Atkinson Hyperlegible"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
      },
    },
  },
};
