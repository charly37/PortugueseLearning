import React, { useState, useEffect } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, CircularProgress, Box, Alert, Button } from '@mui/material';
import { useTranslation } from 'react-i18next';
import Header from './components/Header';
import LandingPage from './components/LandingPage';
import AboutPage from './components/AboutPage';
import ChallengePage from './components/ChallengePage';
import VerbChallengePage from './components/VerbChallengePage';
import IdiomChallengePage from './components/IdiomChallengePage';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import ProfilePage from './components/ProfilePage';
import ChallengeStatsPage from './components/ChallengeStatsPage';
import FlashcardLearnPage from './components/FlashcardLearnPage';
import WeeklyChallengePage from './components/WeeklyChallengePage';

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

type PageType = 'landing' | 'about' | 'word-challenge' | 'word-learn' | 'verb-challenge' | 'verb-learn' | 'idiom-challenge' | 'idiom-learn' | 'login' | 'register' | 'profile' | 'word-stats' | 'verb-stats' | 'idiom-stats' | 'weekly-challenge';

interface User {
  id: string;
  username: string;
  email?: string;  // Optional for guest users
  isGuest?: boolean;  // Guest user flag
  guestExpiresAt?: string;  // Expiration date for guest users
  preferredLanguage?: 'fr' | 'en';
  mobileFriendly?: boolean;
  createdAt?: string;
}

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageType>('landing');
  const [weeklyContext, setWeeklyContext] = useState<{ active: boolean; challenges: any[] }>({ active: false, challenges: [] });
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { i18n, t } = useTranslation();

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
      // First check if there's an active session
      const response = await fetch('/api/auth/check-auth');
      const data = await response.json();
      
      if (data.authenticated && data.user) {
        setUser(data.user);
        // If this is a guest, store their ID in localStorage
        if (data.user.isGuest) {
          localStorage.setItem('guestUserId', data.user.id);
        }
      } else {
        // If no active session, try to restore guest from localStorage
        const guestUserId = localStorage.getItem('guestUserId');
        if (guestUserId) {
          await restoreGuestSession(guestUserId);
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const restoreGuestSession = async (guestUserId: string) => {
    try {
      const response = await fetch('/api/auth/restore-guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestUserId }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        // If restore failed (expired or deleted), remove from localStorage
        localStorage.removeItem('guestUserId');
      }
    } catch (error) {
      console.error('Failed to restore guest session:', error);
      localStorage.removeItem('guestUserId');
    }
  };

  const handleCreateGuest = async (): Promise<User | null> => {
    try {
      const response = await fetch('/api/auth/create-guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredLanguage: i18n.language }),
      });

      if (response.ok) {
        const data = await response.json();
        const guestUser = data.user;
        setUser(guestUser);
        // Store guest ID in localStorage
        localStorage.setItem('guestUserId', guestUser.id);
        return guestUser;
      } else {
        console.error('Failed to create guest account');
        return null;
      }
    } catch (error) {
      console.error('Error creating guest account:', error);
      return null;
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
      // Clear guest ID from localStorage on logout
      localStorage.removeItem('guestUserId');
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

  const showHeader = true;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {showHeader && (
        <Header
          user={user}
          currentPage={currentPage}
          onNavigateHome={() => setCurrentPage('landing')}
          onNavigateAbout={() => setCurrentPage('about')}
          onNavigateProfile={() => setCurrentPage('profile')}
          onLogout={handleLogout}
          onNavigateLogin={() => setCurrentPage('login')}
          onNavigateRegister={() => setCurrentPage('register')}
        />
      )}
      {/* Guest Mode Banner */}
      {user?.isGuest && showHeader && (() => {
        const daysRemaining = user.guestExpiresAt 
          ? Math.ceil((new Date(user.guestExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : null;
        const isExpiringSoon = daysRemaining !== null && daysRemaining <= 2;
        
        return (
          <Alert 
            severity={isExpiringSoon ? "warning" : "info"}
            sx={{ 
              borderRadius: 0,
              justifyContent: 'center',
              '& .MuiAlert-message': {
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flexWrap: 'wrap',
                justifyContent: 'center'
              }
            }}
            action={
              <Button 
                color="inherit" 
                size="small" 
                onClick={() => setCurrentPage('register')}
                sx={{ fontWeight: 600 }}
              >
                {t('guest.createAccount')}
              </Button>
            }
          >
            {isExpiringSoon ? (
              <>⚠️ {t('guest.expiresInDays', { days: daysRemaining })} {t('guest.createAccountToKeep')}</>
            ) : (
              <>🎯 {t('guest.banner')} {t('guest.toSavePermanently')}</>
            )}
          </Alert>
        );
      })()}
      <Box sx={{ minHeight: '100vh' }}>
        {currentPage === 'login' && (
          <LoginPage
            onLoginSuccess={handleLoginSuccess}
            onNavigateToRegister={() => setCurrentPage('register')}
          />
        )}
        {currentPage === 'register' && (
          <RegisterPage
            user={user}
            onRegisterSuccess={handleRegisterSuccess}
            onNavigateToLogin={() => setCurrentPage('login')}
          />
        )}
        {currentPage === 'landing' && (
          <LandingPage
            user={user}
            onWordChallenge={() => setCurrentPage('word-challenge')}
            onWordLearn={() => setCurrentPage('word-learn')}
            onVerbChallenge={() => setCurrentPage('verb-challenge')}
            onVerbLearn={() => setCurrentPage('verb-learn')}
            onIdiomChallenge={() => setCurrentPage('idiom-challenge')}
            onIdiomLearn={() => setCurrentPage('idiom-learn')}
            onViewProfile={() => setCurrentPage('profile')}
            onLogout={handleLogout}
            onViewWordStats={() => setCurrentPage('word-stats')}
            onViewVerbStats={() => setCurrentPage('verb-stats')}
            onViewIdiomStats={() => setCurrentPage('idiom-stats')}
            onWeeklyChallenge={() => setCurrentPage('weekly-challenge')}
          />
        )}
        {currentPage === 'about' && (
          <AboutPage />
        )}
        {currentPage === 'word-learn' && (
          <FlashcardLearnPage challengeType="word" onBackHome={() => setCurrentPage('landing')} user={user} onNavigateToLogin={() => setCurrentPage('login')} onNavigateToRegister={() => setCurrentPage('register')} onCreateGuest={handleCreateGuest} />
        )}
        {currentPage === 'word-challenge' && (
          <ChallengePage
            mode="challenge"
            onBackHome={() => {
              if (weeklyContext.active) {
                setWeeklyContext({ active: false, challenges: [] });
                setCurrentPage('weekly-challenge');
              } else {
                setCurrentPage('landing');
              }
            }}
            user={user}
            onNavigateToLogin={() => setCurrentPage('login')}
            onNavigateToRegister={() => setCurrentPage('register')}
            onCreateGuest={handleCreateGuest}
            preloadedChallenges={weeklyContext.active ? weeklyContext.challenges : undefined}
            onAnswerChecked={weeklyContext.active ? (challengeId, correct) => {
              fetch('/api/weekly-challenge/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ challengeId, correct }),
              }).catch(() => {});
            } : undefined}
          />
        )}
        {currentPage === 'verb-learn' && (
          <FlashcardLearnPage challengeType="verb" onBackHome={() => setCurrentPage('landing')} user={user} onNavigateToLogin={() => setCurrentPage('login')} onNavigateToRegister={() => setCurrentPage('register')} onCreateGuest={handleCreateGuest} />
        )}
        {currentPage === 'verb-challenge' && (
          <VerbChallengePage mode="challenge" onBackHome={() => setCurrentPage('landing')} user={user} onNavigateToLogin={() => setCurrentPage('login')} onNavigateToRegister={() => setCurrentPage('register')} onCreateGuest={handleCreateGuest} />
        )}
        {currentPage === 'idiom-learn' && (
          <FlashcardLearnPage challengeType="idiom" onBackHome={() => setCurrentPage('landing')} user={user} onNavigateToLogin={() => setCurrentPage('login')} onNavigateToRegister={() => setCurrentPage('register')} onCreateGuest={handleCreateGuest} />
        )}
        {currentPage === 'idiom-challenge' && (
          <IdiomChallengePage mode="challenge" onBackHome={() => setCurrentPage('landing')} user={user} onNavigateToLogin={() => setCurrentPage('login')} onNavigateToRegister={() => setCurrentPage('register')} onCreateGuest={handleCreateGuest} />
        )}
        {currentPage === 'profile' && user && (
          <ProfilePage 
            user={user} 
            onBackHome={() => setCurrentPage('landing')} 
            onUserUpdate={(updatedUser) => setUser(updatedUser)}
          />
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
        {currentPage === 'weekly-challenge' && (
          <WeeklyChallengePage
            onBackHome={() => setCurrentPage('landing')}
            onPlayWeekly={(challenges) => {
              // Only include words not yet mastered (correct !== true) so the user
              // retries only what they haven't learned yet
              const mapped = challenges
                .filter((w: any) => w.correct !== true)
                .map((w: any) => ({
                  id: w.challengeId,
                  port: w.portuguese,
                  fr: { translation: w.translation_fr, note: '' },
                  en: { translation: w.translation_en, note: '' },
                }));
              setWeeklyContext({ active: true, challenges: mapped });
              setCurrentPage('word-challenge');
            }}
          />
        )}
      </Box>
    </ThemeProvider>
  );
};

export default App;
