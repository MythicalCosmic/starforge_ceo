export function SfStar({ size = 24, color = 'currentColor' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M16 1 L19.4 11.2 L29.9 11.5 L21.3 17.6 L24.5 27.9 L16 21.4 L7.5 27.9 L10.7 17.6 L2.1 11.5 L12.6 11.2 Z"
        fill={color}
      />
      <circle cx="16" cy="16" r="2.2" fill="var(--sf-bg, #FBF6EC)" />
    </svg>
  );
}

const AVATAR_COLORS = ['#B85535', '#D89A2E', '#4F7B3B', '#2A6F9F', '#7A4A82', '#A55A24', '#3F6E5C'];

export function SfAvatar({ name = 'A', size = 36, color }) {
  const safeName = String(name || 'A');
  const initials = safeName
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const hash = [...safeName].reduce((total, character) => total + character.charCodeAt(0), 0);
  const background = color || AVATAR_COLORS[hash % AVATAR_COLORS.length];

  return (
    <div
      role="img"
      aria-label={safeName}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background,
        color: '#FFFCF5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--sf-font-ui)',
        fontWeight: 700,
        fontSize: size * 0.4,
        letterSpacing: '-0.01em',
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

export function Pill({ tone = 'neutral', children, dot }) {
  return (
    <span className={`ad-pill ad-pill-${tone}`}>
      {dot && <span className="ad-pill-dot" />}
      {children}
    </span>
  );
}

export function Button({
  children,
  kind = 'soft',
  onClick,
  type = 'button',
  style,
  disabled = false,
}) {
  return (
    <button
      type={type}
      className={`ad-btn ad-btn-${kind}`}
      onClick={onClick}
      disabled={disabled}
      style={style}
    >
      {children}
    </button>
  );
}

export function Card({ title, action, children, pad = true, style }) {
  return (
    <div className="ad-card" style={style}>
      {title && (
        <div className="ad-card-h">
          <h3>{title}</h3>
          {action}
        </div>
      )}
      <div className={pad ? 'ad-card-b' : ''}>{children}</div>
    </div>
  );
}

export function PageHeader({ title, sub, right, eyebrow }) {
  return (
    <div className="ad-page-h">
      <div>
        {eyebrow && <div className="ad-page-eyebrow">{eyebrow}</div>}
        <h1 className="ad-page-title">{title}</h1>
        {sub && <div className="ad-page-sub">{sub}</div>}
      </div>
      {right && <div className="ad-page-right">{right}</div>}
    </div>
  );
}
