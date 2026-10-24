import { useTheme } from '../hooks/useTheme'

/** Switches the staff portal between dark (default) and light mode. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
      <span className="hidden sm:inline"> {theme === 'dark' ? 'Light' : 'Dark'}</span>
    </button>
  )
}
