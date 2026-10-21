import '@park/engine';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadCharacters } from './lib/characters';
import './styles/tokens.css';
import './styles/global.css';
import './components/components.css';
import './components/mahjong.css';
import './screens/table.css';

void loadCharacters();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
