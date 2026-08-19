export function SfStar({ size = 24, color = 'currentColor' }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        flex: '0 0 auto',
        backgroundColor: color,
        WebkitMask: 'url(/brand/symbol.svg) center / contain no-repeat',
        mask: 'url(/brand/symbol.svg) center / contain no-repeat',
      }}
    />
  );
}

const AVATAR_COLORS = ['#B85535', '#D89A2E', '#4F7B3B', '#2A6F9F', '#7A4A82', '#A55A24', '#3F6E5C'];

export function SfAvatar({ name = 'A', size = 36, color, decorative = false }) {
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
      className="sf-avatar"
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : safeName}
      aria-hidden={decorative ? 'true' : undefined}
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
