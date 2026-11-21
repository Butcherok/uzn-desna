import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../site/src/styles/tokens.css';
import './styles/admin.css';
import { App } from './pages/App';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
