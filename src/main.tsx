import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyPaletteToCss } from './theme'
import './styles.css'

applyPaletteToCss()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
