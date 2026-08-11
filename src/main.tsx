import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AdminApp from './AdminApp.tsx'
import { selectAppMode } from './routing.ts'

const RootApp = selectAppMode(window.location.pathname) === 'admin' ? AdminApp : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
)
