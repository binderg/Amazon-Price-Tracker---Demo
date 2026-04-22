import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// PrimeReact theme — import before Tailwind utilities so Tailwind wins specificity
import 'primereact/resources/themes/lara-light-cyan/theme.css'
import 'primeicons/primeicons.css'

// Tailwind + global styles
import './index.css'

import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
