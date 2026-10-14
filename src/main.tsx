import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { App } from './app/App'
import { applyTheme } from './app/theme'
import './styles.css'

applyTheme()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 7 * 24 * 60 * 60 * 1000,
      retry: (count, error) => count < 2 && !/sess[aã]o|JWT/i.test(String(error)),
      refetchOnWindowFocus: true,
      networkMode: 'offlineFirst',
    },
    mutations: { networkMode: 'online' },
  },
})

// Guarda a última leitura no aparelho: o app abre na hora, mesmo sem internet.
const persister = createSyncStoragePersister({ storage: window.localStorage, key: 'control:cache', throttleTime: 2000 })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 7 * 24 * 60 * 60 * 1000, buster: __APP_VERSION__ }}>
      <App />
    </PersistQueryClientProvider>
  </StrictMode>,
)
