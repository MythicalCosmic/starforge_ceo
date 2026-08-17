// Line icon library — geometric, consistent 1.7 stroke. Mirrors the design source.
const SfIcon = ({ d, size = 22, stroke = 1.7, fill = 'none', children, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
    aria-hidden="true"
    focusable="false"
  >
    {d ? <path d={d} /> : children}
  </svg>
);

export const Icons = {
  home: <SfIcon><path d="M3.5 11.2 L12 4 L20.5 11.2 V20 a1 1 0 0 1 -1 1 H4.5 a1 1 0 0 1 -1 -1 Z" /><path d="M9.5 21 v-6.5 h5 V21" /></SfIcon>,
  cal: <SfIcon><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10 H21 M8 3 V7 M16 3 V7" /></SfIcon>,
  cohort: <SfIcon><circle cx="9" cy="10" r="3.2" /><circle cx="17" cy="11" r="2.5" /><path d="M3.5 20 c0-3 2.5-5 5.5-5 s5.5 2 5.5 5" /><path d="M14.5 19.5 c0.3-2 2-3.5 4-3.5 c1 0 1.7 0.3 2 0.8" /></SfIcon>,
  chat: <SfIcon><path d="M5 4 H19 a2 2 0 0 1 2 2 v9 a2 2 0 0 1 -2 2 H12 L7 21 V17 H5 a2 2 0 0 1 -2 -2 V6 a2 2 0 0 1 2 -2 Z" /></SfIcon>,
  bell: <SfIcon><path d="M6 16 V11 a6 6 0 0 1 12 0 V16 L20 18 H4 Z M10 21 a2 2 0 0 0 4 0" /></SfIcon>,
  user: <SfIcon><circle cx="12" cy="8" r="3.7" /><path d="M4.5 20 c0-3.5 3-6 7.5-6 s7.5 2.5 7.5 6" /></SfIcon>,
  check: <SfIcon d="M5 12.5 L10 17.5 L19.5 7" stroke={2.4} />,
  plus: <SfIcon d="M12 5 V19 M5 12 H19" stroke={2.2} />,
  x: <SfIcon d="M6 6 L18 18 M18 6 L6 18" stroke={2.4} />,
  search: <SfIcon><circle cx="11" cy="11" r="6" /><path d="M16 16 L20.5 20.5" /></SfIcon>,
  chevR: <SfIcon d="M9 6 L15 12 L9 18" />,
  filter: <SfIcon d="M4 5 H20 M7 12 H17 M10 19 H14" />,
  ai: <SfIcon><path d="M12 3 L13.5 9 L19.5 10.5 L13.5 12 L12 18 L10.5 12 L4.5 10.5 L10.5 9 Z" /><circle cx="19" cy="5" r="1.2" fill="currentColor" /><circle cx="6" cy="19" r="1.2" fill="currentColor" /></SfIcon>,
  doc: <SfIcon><path d="M6 3 H14 L19 8 V21 H6 Z M14 3 V8 H19 M8 13 H17 M8 17 H14" /></SfIcon>,
  folder: <SfIcon><path d="M3 7 a2 2 0 0 1 2-2 h4 L11 7 H19 a2 2 0 0 1 2 2 V18 a2 2 0 0 1 -2 2 H5 a2 2 0 0 1 -2 -2 Z" /></SfIcon>,
  trend: <SfIcon d="M4 17 L9 11 L13 14 L20 6 M20 6 H15 M20 6 V11" />,
  wallet: <SfIcon><path d="M4 6.5 H18.5 a2 2 0 0 1 2 2 V18 a2 2 0 0 1 -2 2 H5 a2 2 0 0 1 -2 -2 V6 a2 2 0 0 1 2 -2 H17" /><path d="M15 11 H21 V16 H15 a2.5 2.5 0 0 1 0 -5 Z" /><circle cx="16.5" cy="13.5" r=".7" fill="currentColor" /></SfIcon>,
  globe: <SfIcon><circle cx="12" cy="12" r="9" /><path d="M3 12 H21 M12 3 a13 13 0 0 1 0 18 M12 3 a13 13 0 0 0 0 18" /></SfIcon>,
  settings: <SfIcon><circle cx="12" cy="12" r="3" /><path d="M12 2 V5 M12 19 V22 M4 12 H2 M22 12 H19 M5.6 5.6 L7 7 M17 17 L18.4 18.4 M5.6 18.4 L7 17 M17 7 L18.4 5.6" /></SfIcon>,
  logout: <SfIcon d="M9 5 H5 a1 1 0 0 0 -1 1 V18 a1 1 0 0 0 1 1 H9 M15 8 L20 12 L15 16 M20 12 H9" />,
  brand: <SfIcon><path d="M12 3 L14 9 L20 10 L15 14 L17 20 L12 17 L7 20 L9 14 L4 10 L10 9 Z" /></SfIcon>,
  shield: <SfIcon d="M12 3 L20 6 V12 c0 5-4 8-8 9 c-4-1-8-4-8-9 V6 Z" />,
  flag: <SfIcon d="M5 21 V4 H15 L13 8 L15 12 H5" />,
  sun: <SfIcon><circle cx="12" cy="12" r="4.5" /><path d="M12 2 V4 M12 20 V22 M2 12 H4 M20 12 H22 M5 5 L6.5 6.5 M17.5 17.5 L19 19 M19 5 L17.5 6.5 M6.5 17.5 L5 19" /></SfIcon>,
  moon: <SfIcon><path d="M20 14 A8 8 0 0 1 10 4 A7 7 0 1 0 20 14 Z" /></SfIcon>,
};
