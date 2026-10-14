/**
 * Kova — brand mark (ink monogram with gold route dot)
 */

export function KovaIcon({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="48" height="48" rx="14" fill="#0C0A09" />
      {/* K — upright stem with the outbound stroke ending in a route pin */}
      <path
        d="M15 13V35"
        stroke="#FAFAF9"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M15 25L31 13"
        stroke="#FAFAF9"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M15 25L31 35"
        stroke="#FAFAF9"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <circle cx="33" cy="13" r="4.5" fill="#CA8A04" />
    </svg>
  );
}

export function KovaLogo({ size = 32, showText = true, className = '', light = false }) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}
    >
      <KovaIcon size={size} />
      {showText && (
        <span
          style={{
            fontSize: size * 0.68,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: light ? '#FAFAF9' : '#0C0A09',
            lineHeight: 1,
          }}
        >
          kova
        </span>
      )}
    </span>
  );
}

export default KovaLogo;
