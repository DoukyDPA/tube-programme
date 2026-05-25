import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import CultureApp from './components/CultureApp.jsx'
import { detectAppMode, MODE_CULTURE } from './data/appMode.js'
import './index.css'
import { setupServiceWorker } from './registerSW.js'

const mode = detectAppMode();
const Root = mode === MODE_CULTURE ? CultureApp : App;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)

// Service worker actif uniquement en prod (build Railway)
setupServiceWorker();
