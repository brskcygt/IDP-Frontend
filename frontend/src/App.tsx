import { useState, useEffect } from 'react';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { ThemeProvider } from './components/theme-provider';
import { getTransport } from './services/transport';
import { UpdateModal } from './components/update/UpdateModal';
import { useQueryClient } from '@tanstack/react-query';
import type { SessionUser } from './services/transport/types';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Check session on load
    getTransport()
      .auth.me()
      .then((user) => {
        queryClient.setQueryData(['session'], user);
        setIsAuthenticated(user !== null);
      })
      .catch(() => setIsAuthenticated(false));
  }, [queryClient]);

  const handleLogin = (user: SessionUser) => {
    // A different operator may have used this window immediately before this
    // login. Drop every user-scoped query, then seed the new identity so no
    // stale role or privileged data can flash on screen.
    queryClient.clear();
    queryClient.setQueryData(['session'], user);
    setIsAuthenticated(true);
  };

  if (isAuthenticated === null) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground animate-pulse">Loading IDP...</div>;
  }

  if (!isAuthenticated) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <Login onLogin={handleLogin} />
        <UpdateModal />
      </ThemeProvider>
    );
  }

  const handleLogout = async () => {
    await getTransport().auth.logout();
    queryClient.clear();
    setIsAuthenticated(false);
  };

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="min-h-screen bg-background text-foreground">
        <Dashboard onLogout={handleLogout} />
      </div>
      <UpdateModal />
    </ThemeProvider>
  );
}

export default App;
