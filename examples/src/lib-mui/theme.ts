import { createTheme } from '@mui/material/styles'

/**
 * MUI's own dark theme, tuned to the gallery's chrome (examples.css). Colors
 * are the only thing overridden — the point of the example is MUI's default
 * behavior, not a redesign of it.
 */
export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#1a9fff' },
    error: { main: '#ff6b5e' },
    background: { default: '#0e141b', paper: '#1b2838' },
    text: { primary: '#c7d5e0', secondary: 'rgba(199, 213, 224, 0.62)' },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    fontSize: 13,
  },
})
