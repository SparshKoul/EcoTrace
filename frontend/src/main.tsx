import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './index.css';
import App from './App';
import { AppProvider } from './state/AppContext';
import { ReportProvider } from './context/ReportContext';
import { fetchV1Feed, fetchV1Activity, submitV1Report } from './services/api';

const container = document.getElementById('root');
if (!container) throw new Error('Root element is missing.');

createRoot(container).render(
  <StrictMode>
    <AppProvider>
      <ReportProvider
        fetchFeed={() => fetchV1Feed()}
        fetchActivity={async () => (await fetchV1Activity())?.activity ?? []}
        submit={(input) => submitV1Report(input)}
      >
        <App />
      </ReportProvider>
    </AppProvider>
  </StrictMode>,
);
