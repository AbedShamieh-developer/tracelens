import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from 'react-oidc-context'
import './index.css'
import App from './App.tsx'

function getAppBaseUrl() {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:5174/'
  }

  return `${window.location.origin}/`
}

const cognitoAuthConfig = {
  authority: 'https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_umR2kpRl8',
  client_id: '4570btirsf7kejc3fjkbb6f9jc',
  redirect_uri: getAppBaseUrl(),
  response_type: 'code',
  scope: 'openid email profile',
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, window.location.pathname)
  },
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider {...cognitoAuthConfig}>
      <App />
    </AuthProvider>
  </StrictMode>,
)
