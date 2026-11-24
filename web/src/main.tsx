import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { FournisseurSession } from './noyau/session';
import './styles.css';

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <BrowserRouter>
      <FournisseurSession><App /></FournisseurSession>
    </BrowserRouter>
  </StrictMode>,
);
