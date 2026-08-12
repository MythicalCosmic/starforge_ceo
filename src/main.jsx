import { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/manrope/wght.css';
import './i18n/index.js';
import './styles/tokens.css';
import './styles/app.css';
import './styles/foundation-v2.css';
import App from './App.jsx';
import { PreferencesProvider } from './context/PreferencesContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { PageLoader } from './components/feedback.jsx';
import { queryClient } from './api/queryClient.js';

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<PageLoader label="Opening StarForge EDU…" />}>
        <PreferencesProvider>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </PreferencesProvider>
      </Suspense>
    </QueryClientProvider>
  </ErrorBoundary>,
);
