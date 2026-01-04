import React, { useState, useEffect } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, CircularProgress, Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import Header from './components/Header';
import LandingPage from './components/LandingPage';
import ChallengePage from './components/ChallengePage';
import VerbChallengePage from './components/VerbChallengePage';
import IdiomChallengePage from './components/IdiomChallengePage';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import ProfilePage from './components/ProfilePage';
import ChallengeStatsPage from './components/ChallengeStatsPage';
import FlashcardLearnPage from './components/FlashcardLearnPage';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
    background: {
      default: '#f5f5f5',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h3: {
      fontWeight: 600,
    },
    h4: {
      fontWeight: 600,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
          fontWeight: 500,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
  },
});

type PageType = 'landing' | 'word-practice' | 'word-challenge' | 'word-learn' | 'verb-practice' | 'verb-challenge' | 'verb-learn' | 'idiom-practice' | 'idiom-challenge' | 'idiom-learn' | 'login' | 'register' | 'profile' | 'word-stats' | 'verb-stats' | 'idiom-stats';

interface User {
  id: string;
  username: string;
  email: string;
  preferredLanguage?: 'fr' | 'en';
  createdAt?: string;
}

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageType>('landing');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { i18n } = useTranslation();

  // Check authentication status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Sync i18n language with user preference
  useEffect(() => {
    if (user?.preferredLanguage) {
      i18n.changeLanguage(user.preferredLanguage);
    }
  }, [user?.preferredLanguage, i18n]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/check-auth');
      const data = await response.json();
      
      if (data.authenticated && data.user) {
        setUser(data.user);
      }
      // Always allow access to landing page, even if not authenticated
    } catch (error) {
      console.error('Auth check failed:', error);
      // Continue to landing page even if auth check fails
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
      setCurrentPage('landing');
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

  const showHeader = currentPage !== 'login' && currentPage !== 'register';

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {showHeader && (
        <Header
          user={user}
          currentPage={currentPage}
          onNavigateHome={() => setCurrentPage('landing')}
          onNavigateProfile={() => setCurrentPage('profile')}
          onLogout={handleLogout}
          onNavigateLogin={() => setCurrentPage('login')}
          onNavigateRegister={() => setCurrentPage('register')}
        />
      )}
      <Box sx={{ minHeight: '100vh' }}>
        {currentPage === 'login' && (
          <LoginPage
            onLoginSuccess={handleLoginSuccess}
            onNavigateToRegister={() => setCurrentPage('register')}
          />
        )}
        {currentPage === 'register' && (
          <RegisterPage
            onRegisterSuccess={handleRegisterSuccess}
            onNavigateToLogin={() => setCurrentPage('login')}
          />
        )}
        {currentPage === 'landing' && (
          <LandingPage
            user={user}
            onWordPractice={() => setCurrentPage('word-practice')}
            onWordChallenge={() => setCurrentPage('word-challenge')}
            onWordLearn={() => setCurrentPage('word-learn')}
            onVerbPractice={() => setCurrentPage('verb-practice')}
            onVerbChallenge={() => setCurrentPage('verb-challenge')}
            onVerbLearn={() => setCurrentPage('verb-learn')}
            onIdiomPractice={() => setCurrentPage('idiom-practice')}
            onIdiomChallenge={() => setCurrentPage('idiom-challenge')}
            onIdiomLearn={() => setCurrentPage('idiom-learn')}
            onViewProfile={() => setCurrentPage('profile')}
            onLogout={handleLogout}
            onViewWordStats={() => setCurrentPage('word-stats')}
            onViewVerbStats={() => setCurrentPage('verb-stats')}
            onViewIdiomStats={() => setCurrentPage('idiom-stats')}
          />
        )}
        {currentPage === 'word-learn' && (
          <FlashcardLearnPage challengeType="word" onBackHome={() => setCurrentPage('landing')} user={user} />
        )}
        {currentPage === 'word-practice' && (
          <ChallengePage mode="practice" onBackHome={() => setCurrentPage('landing')} user={user} onNavigateToLogin={() => setCurrentPage('login')} onNavigateToRegister={() => setCurrentPage('register')} />
        )}
        {currentPage === 'word-challenge' && (
          <ChallengePage mode="challenge" onBackHome={() => setCurrentPage('landing')} user={user} onNavigateToLogin={() => setCurrentPage('login')} onNavigateToRegister={() => setCurrentPage('register')} />
        )}
        {currentPage === 'verb-practice' && (
          <VerbChallengePage mode="practice" onBackHome={() => setCurrentPage('landing')} user={user} onNavigateToLogin={() => setCurrentPage('login')} onNavigateToRegister={() => setCurrentPage('register')} />
        )}
        {currentPage === 'verb-learn' && (
          <FlashcardLearnPage challengeType="verb" onBackHome={() => setCurrentPage('landing')} user={user} />
        )}
        {currentPage === 'verb-challenge' && (
          <VerbChallengePage mode="challenge" onBackHome={() => setCurrentPage('landing')} user={user} onNavigateToLogin={() => setCurrentPage('login')} onNavigateToRegister={() => setCurrentPage('register')} />
        )}
        {currentPage === 'idiom-practice' && (
          <IdiomChallengePage mode="practice" onBackHome={() => setCurrentPage('landing')} user={user} onNavigateToLogin={() => setCurrentPage('login')} onNavigateToRegister={() => setCurrentPage('register')} />
        )}
        {currentPage === 'idiom-learn' && (
          <FlashcardLearnPage challengeType="idiom" onBackHome={() => setCurrentPage('landing')} user={user} />
        )}
        {currentPage === 'idiom-challenge' && (
          <IdiomChallengePage mode="challenge" onBackHome={() => setCurrentPage('landing')} user={user} onNavigateToLogin={() => setCurrentPage('login')} onNavigateToRegister={() => setCurrentPage('register')} />
        )}
        {currentPage === 'profile' && user && (
          <ProfilePage user={user} onBackHome={() => setCurrentPage('landing')} />
        )}
        {currentPage === 'profile' && !user && (
          <LoginPage
            onLoginSuccess={handleLoginSuccess}
            onNavigateToRegister={() => setCurrentPage('register')}
          />
        )}
        {currentPage === 'word-stats' && (
          <ChallengeStatsPage 
            challengeType="word"
            onBackHome={() => setCurrentPage('landing')}
            onStartChallenge={() => setCurrentPage('word-challenge')}
          />
        )}
        {currentPage === 'verb-stats' && (
          <ChallengeStatsPage 
            challengeType="verb"
            onBackHome={() => setCurrentPage('landing')}
            onStartChallenge={() => setCurrentPage('verb-challenge')}
          />
        )}
        {currentPage === 'idiom-stats' && (
          <ChallengeStatsPage 
            challengeType="idiom"
            onBackHome={() => setCurrentPage('landing')}
            onStartChallenge={() => setCurrentPage('idiom-challenge')}
          />
        )}
      </Box>
    </ThemeProvider>
  );
};

export default App;
