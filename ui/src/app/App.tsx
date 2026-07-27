import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { getAdminToken } from '../api/client.ts'
import { Layout } from '../components/Layout.tsx'
import { ToastProvider } from '../components/toast.tsx'
import { LoginPage } from '../features/auth/LoginPage.tsx'
import { NodesPage } from '../features/nodes/NodesPage.tsx'
import { ProfileDetailPage, ProfilesPage } from '../features/profiles/ProfilesPage.tsx'
import { RuleProvidersPage } from '../features/rule-providers/RuleProvidersPage.tsx'
import { RulePackDetailPage, RulesPage } from '../features/rules/RulesPage.tsx'
import { SecurityPage } from '../features/security/SecurityPage.tsx'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: false }, mutations: { retry: false } },
})

export function App() {
  return <ToastProvider>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthRouter />
      </BrowserRouter>
    </QueryClientProvider>
  </ToastProvider>
}

function AuthRouter() {
  const [authenticated, setAuthenticated] = useState(() => Boolean(getAdminToken()))
  useEffect(() => {
    const update = () => { setAuthenticated(Boolean(getAdminToken())); void queryClient.clear() }
    window.addEventListener('clashdash-auth', update)
    return () => window.removeEventListener('clashdash-auth', update)
  }, [])
  if (!authenticated) return <LoginPage onAuthenticated={() => setAuthenticated(true)} />
  return <Routes>
    <Route element={<Layout />}>
      <Route path="/nodes" element={<NodesPage />} />
      <Route path="/rules" element={<RulesPage />} />
      <Route path="/rules/new" element={<RulePackDetailPage creating />} />
      <Route path="/rules/:id" element={<RulePackDetailPage />} />
      <Route path="/rule-providers" element={<RuleProvidersPage />} />
      <Route path="/profiles" element={<ProfilesPage />} />
      <Route path="/profiles/:id" element={<ProfileDetailPage />} />
      <Route path="/security" element={<SecurityPage />} />
      <Route path="*" element={<Navigate to="/nodes" replace />} />
    </Route>
  </Routes>
}
