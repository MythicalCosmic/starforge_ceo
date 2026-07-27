import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  DENSITIES,
  NAVIGATION_LAYOUTS,
  PALETTES,
  THEMES,
} from './preferenceOptions.js';

const PreferencesContext = createContext(null);

const read = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

const readChoice = (key, choices, fallback) => {
  const saved = read(key, fallback);
  return choices.includes(saved) ? saved : fallback;
};

export function PreferencesProvider({ children }) {
  const [theme, setThemeState] = useState(() =>
    readChoice('sf-theme', THEMES, 'light'));
  const [palette, setPaletteState] = useState(() =>
    readChoice('sf-palette', PALETTES, 'saroy'));
  const [density, setDensityState] = useState(() =>
    readChoice('sf-density', DENSITIES, 'dense'));
  const [navigationLayout, setNavigationLayoutState] = useState(() =>
    readChoice('sf-navigation-layout', NAVIGATION_LAYOUTS, 'sidebar'));

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-palette', palette);
    root.setAttribute('data-density', density);
    root.setAttribute('data-navigation', navigationLayout);
  }, [density, navigationLayout, palette, theme]);

  const persist = (key, value, setter) => {
    setter(value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable — keep in-memory state */
    }
  };

  const value = useMemo(
    () => ({
      theme,
      setTheme: (nextTheme) => {
        const next = THEMES.includes(nextTheme) ? nextTheme : 'light';
        persist('sf-theme', next, setThemeState);
      },
      toggleTheme: () =>
        persist('sf-theme', theme === 'dark' ? 'light' : 'dark', setThemeState),
      palette,
      setPalette: (nextPalette) => {
        const next = PALETTES.includes(nextPalette) ? nextPalette : 'saroy';
        persist('sf-palette', next, setPaletteState);
      },
      density,
      setDensity: (nextDensity) => {
        const next = DENSITIES.includes(nextDensity) ? nextDensity : 'dense';
        persist('sf-density', next, setDensityState);
      },
      navigationLayout,
      setNavigationLayout: (nextLayout) => {
        const next = NAVIGATION_LAYOUTS.includes(nextLayout) ? nextLayout : 'sidebar';
        persist('sf-navigation-layout', next, setNavigationLayoutState);
      },
    }),
    [density, navigationLayout, palette, theme],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
