import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './context/AuthContext'
import App from './App.jsx'
import EnvBanner from './components/EnvBanner'
import TemaProvider from './presentation/tema/TemaProvider'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TemaProvider>
      <AuthProvider>
        <div className="h-full flex flex-col">
          <EnvBanner />
          <div className="flex-1 min-h-0">
            <App />
          </div>
        </div>
      </AuthProvider>
    </TemaProvider>
  </StrictMode>,
)
