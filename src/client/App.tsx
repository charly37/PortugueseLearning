import React, { useState, useEffect } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, CircularProgress, Box } from '@mui/material';
import LandingPage from './components/LandingPage';
import ChallengePage from './components/ChallengePage';
import VerbChallengePage from './components/VerbChallengePage';
import IdiomChallengePage from './components/IdiomChallengePage';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import ProfilePage from './components/ProfilePage';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

type PageType = 'landing' | 'challenge' | 'verb-challenge' | 'idiom-challenge' | 'login' | 'register' | 'profile';

interface User {
  id: string;
  username: string;
  email: string;
  createdAt?: string;
}

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageType>('login');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check authentication status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/check-auth');
      const data = await response.json();
      
      if (data.authenticated && data.user) {
        setUser(data.user);
        setCurrentPage('landing');
      } else {
        setCurrentPage('login');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setCurrentPage('login');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = (userData: User) => {
    setUser(userData);
    setCurrentPage('landing');
  };

  const handleRegisterSuccess = (userData: User) => {
    setUser(userData);
    setCurrentPage('landing');
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setCurrentPage('login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (loading) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
          }}
        >
          <CircularProgress />
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {currentPage === 'login' ? (
        <LoginPage 
          onLoginSuccess={handleLoginSuccess}
          onNavigateToRegister={() => setCurrentPage('register')}
        />
      ) : currentPage === 'register' ? (
        <RegisterPage 
          onRegisterSuccess={handleRegisterSuccess}
          onNavigateToLogin={() => setCurrentPage('login')}
        />
      ) : currentPage === 'landing' ? (
        <LandingPage 
          user={user}
          onStartLearning={() => setCurrentPage('challenge')}
          onVerbChallenge={() => setCurrentPage('verb-challenge')}
          onIdiomChallenge={() => setCurrentPage('idiom-challenge')}
          onViewProfile={() => setCurrentPage('profile')}
          onLogout={handleLogout}
        />
      ) : currentPage === 'profile' ? (
        <ProfilePage 
          user={user}
          onBackHome={() => setCurrentPage('landing')}
        />
      ) : currentPage === 'challenge' ? (
        <ChallengePage onBackHome={() => setCurrentPage('landing')} />
      ) : currentPage === 'verb-challenge' ? (
        <VerbChallengePage onBackHome={() => setCurrentPage('landing')} />
      ) : (
        <IdiomChallengePage onBackHome={() => setCurrentPage('landing')} />
      )}
    </ThemeProvider>
  );
};

export default App;
