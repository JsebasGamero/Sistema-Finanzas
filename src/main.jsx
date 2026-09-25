import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './context/AuthContext'
import App from './App.jsx'
import EnvBanner from './components/EnvBanner'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <div className="h-full flex flex-col">
        <EnvBanner />
        <div className="flex-1 min-h-0">
          <App />
        </div>
      </div>
    </AuthProvider>
  </StrictMode>,
)
