(() => {
  const preferences = {
    theme: { key: 'sf-theme', choices: ['light', 'dark'] },
    palette: {
      key: 'sf-palette',
      choices: ['saroy', 'marvarid', 'samarqand', 'daryo', 'osmon', 'uchqun', 'meros'],
    },
    density: { key: 'sf-density', choices: ['dense', 'comfortable'] },
    navigation: {
      key: 'sf-navigation-layout',
      choices: ['sidebar', 'top'],
    },
  };
  const defaults = {
    theme: 'light',
    palette: 'saroy',
    density: 'dense',
    navigation: 'sidebar',
  };

  try {
    for (const [attribute, preference] of Object.entries(preferences)) {
      const saved = localStorage.getItem(preference.key);
      document.documentElement.dataset[attribute] = preference.choices.includes(saved)
        ? saved
        : defaults[attribute];
    }
  } catch {
    for (const [attribute, value] of Object.entries(defaults)) {
      document.documentElement.dataset[attribute] = value;
    }
  }
})();
