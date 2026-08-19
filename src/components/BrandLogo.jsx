export function BrandLogo({
  compact = false,
  tone = 'auto',
  className = '',
  label = 'Starforge',
  decorative = false,
}) {
  const classes = [
    'sf-brand-logo',
    compact ? 'sf-brand-logo--symbol' : 'sf-brand-logo--lockup',
    `sf-brand-logo--${tone}`,
    className,
  ].filter(Boolean).join(' ');
  const accessibility = decorative
    ? { 'aria-hidden': 'true' }
    : { role: 'img', 'aria-label': label };

  return <picture className={classes} {...accessibility} />;
}
