import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/newsreader/wght-italic.css';
import './i18n/index.js';
import './styles/tokens.css';
import './styles/app.css';
import './styles/foundation-v2.css';
import './styles/dashboard-v2.css';
import './styles/resource-v2.css';
import './styles/settings-v2.css';
import './styles/shell-v2.css';
import App from './App.jsx';
import { PreferencesProvider } from './context/PreferencesContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={null}>
        <PreferencesProvider>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </PreferencesProvider>
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
);
