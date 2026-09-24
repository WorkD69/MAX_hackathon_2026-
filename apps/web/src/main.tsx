import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AppProviders } from './app/app-providers.js';
import { createAppRouter } from './app/router.js';
import './styles/base.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('ROOT_MISSING');

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={createAppRouter()} />
    </AppProviders>
  </StrictMode>,
);
