type LogoProps = {
  inverted?: boolean;
  size?: number;
  title?: string;
};

/** Balanced scale in a navy rounded square. */
export function Logo({ inverted = false, size = 36, title = 'Referendum' }: LogoProps) {
  const ground = inverted ? '#FBFAF5' : '#0B2545';
  const mark = inverted ? '#0B2545' : '#FBFAF5';
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={title}>
      <rect width="48" height="48" rx="8" fill={ground} />
      <path d="M24 8v32M10 24h28" stroke={mark} strokeWidth="2.4" />
      <path d="M24 10l-6 8h12l-6-8z" fill={mark} />
      <circle cx="16" cy="24" r="2.2" fill={mark} />
      <circle cx="32" cy="24" r="2.2" fill={mark} />
      <path d="M18 32h12" stroke={mark} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
