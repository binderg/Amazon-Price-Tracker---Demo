import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// PrimeReact icons (not a theme — fine to import normally)
import 'primeicons/primeicons.css'

// Tailwind + PrimeReact theme (with correct layer ordering) + global styles
import './index.css'

import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
