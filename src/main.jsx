import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import CultureApp from './components/CultureApp.jsx'
import { detectAppMode, MODE_CULTURE } from './data/appMode.js'
import './index.css'
import { setupServiceWorker } from './registerSW.js'

// -----------------------------------------------------------------
// Sortie de l'ancien domaine
// -----------------------------------------------------------------
// Une application installée depuis tubiscope.fr avant la bascule reste
// collée à cette origine : son service worker sert la coquille depuis le
// cache, la redirection serveur n'est donc jamais suivie. Or Cloudflare
// intercepte /api/* sur tubiscope.fr et renvoie du HTML : l'application
// s'ouvre, se croit chez elle, et ne peut charger aucune vidéo.
//
// On quitte donc l'origine historique dès le démarrage, avant tout
// rendu. C'est ce qui répare les installations d'avant la bascule, à la
// première fois où elles récupèrent ce bundle.
const LEGACY_HOST = 'tubiscope.fr';
const CANONICAL_ORIGIN = 'https://tubiscope.com';

if (typeof window !== 'undefined') {
  const host = window.location.hostname.toLowerCase();
  if (host === LEGACY_HOST || host.endsWith(`.${LEGACY_HOST}`)) {
    const path = window.location.pathname === '/' ? '/culture' : window.location.pathname;
    window.location.replace(`${CANONICAL_ORIGIN}${path}${window.location.search}`);
  }
}

const mode = detectAppMode();
const Root = mode === MODE_CULTURE ? CultureApp : App;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)

// Service worker actif uniquement en prod (build Railway)
setupServiceWorker();
