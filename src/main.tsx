import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
if (import.meta.env.VITE_FONTS !== 'google') import('./fonts')
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
