import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

/*
 * ThemeToggle — Dark / Light mode switcher.
 *
 * The actual theming is driven by a `dark` class on the <html> element (see
 * src/index.css `@custom-variant dark`). The initial state is resolved from:
 *   1. The persisted "eron_theme" key in localStorage, otherwise
 *   2. The OS `prefers-color-scheme` media query.
 * The index.html inline script mirrors this logic pre-hydration to avoid a
 * flash of the wrong theme. The <html> class stays in sync with localStorage
 * so reloads and direct links keep the user's choice.
 */
export function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('eron_theme') === 'dark' ||
        (!('eron_theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  // Apply the toggle to <html> and persist the choice.
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('eron_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('eron_theme', 'light');
    }
  }, [isDark]);

  return (
    <button
      id="btn-theme-toggle"
      onClick={() => setIsDark(!isDark)}
      className="p-2 rounded-lg border border-line dark:border-line bg-white dark:bg-surface text-ink2 dark:text-ink2 hover:bg-surface2 dark:hover:bg-surface2 transition-colors flex items-center gap-2 text-xs font-medium"
      title="Toggle Dark / Light Theme"
    >
      {isDark ? (
        <>
          <Sun className="w-4 h-4 text-amber-400" />
          <span className="hidden sm:inline">Light Mode</span>
        </>
      ) : (
        <>
          <Moon className="w-4 h-4 text-primary" />
          <span className="hidden sm:inline">Dark Mode</span>
        </>
      )}
    </button>
  );
}
