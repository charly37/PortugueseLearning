import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
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
import WeeklyStoryPage from './components/WeeklyStoryPage';

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

type PageType = 'landing' | 'about' | 'word-challenge' | 'word-learn' | 'verb-challenge' | 'verb-learn' | 'idiom-challenge' | 'idiom-learn' | 'login' | 'register' | 'profile' | 'word-stats' | 'verb-stats' | 'idiom-stats' | 'weekly-challenge' | 'weekly-story';

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

interface WeeklyRouteState {
  active: boolean;
  challenges: any[];
}

// Inner component: needs router context for useNavigate / useLocation
const AppContent: React.FC = () => {
  const navigate = useNavigate();
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
      const response = await fetch('/api/auth/check-auth');
      const data = await response.json();

      if (data.authenticated && data.user) {
        setUser(data.user);
        if (data.user.isGuest) {
          localStorage.setItem('guestUserId', data.user.id);
        }
      } else {
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
    navigate('/');
  };

  const handleRegisterSuccess = (userData: User) => {
    setUser(userData);
    navigate('/');
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      localStorage.removeItem('guestUserId');
      setUser(null);
      navigate('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Guest banner — rendered outside Routes so it appears on every page
  const guestBanner = user?.isGuest ? (() => {
    const daysRemaining = user.guestExpiresAt
      ? Math.ceil((new Date(user.guestExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;
    const isExpiringSoon = daysRemaining !== null && daysRemaining <= 2;

    return (
      <Alert
        severity={isExpiringSoon ? 'warning' : 'info'}
        sx={{
          borderRadius: 0,
          justifyContent: 'center',
          '& .MuiAlert-message': {
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
            justifyContent: 'center',
          },
        }}
        action={
          <Button color="inherit" size="small" onClick={() => navigate('/register')} sx={{ fontWeight: 600 }}>
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
  })() : null;

  return (
    <>
      <Header
        user={user}
        onNavigateHome={() => navigate('/')}
        onNavigateAbout={() => navigate('/about')}
        onNavigateProfile={() => navigate('/profile')}
        onLogout={handleLogout}
        onNavigateLogin={() => navigate('/login')}
        onNavigateRegister={() => navigate('/register')}
      />
      {guestBanner}
      <Box sx={{ minHeight: '100vh' }}>
        <Routes>
          <Route path="/" element={
            <LandingPage
              user={user}
              onWordChallenge={() => navigate('/word-challenge')}
              onWordLearn={() => navigate('/word-learn')}
              onVerbChallenge={() => navigate('/verb-challenge')}
              onVerbLearn={() => navigate('/verb-learn')}
              onIdiomChallenge={() => navigate('/idiom-challenge')}
              onIdiomLearn={() => navigate('/idiom-learn')}
              onViewProfile={() => navigate('/profile')}
              onLogout={handleLogout}
              onViewWordStats={() => navigate('/word-stats')}
              onViewVerbStats={() => navigate('/verb-stats')}
              onViewIdiomStats={() => navigate('/idiom-stats')}
              onWeeklyChallenge={() => navigate('/weekly-challenge')}
              onWeeklyStory={() => navigate('/weekly-story')}
            />
          } />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/login" element={
            <LoginPage
              onLoginSuccess={handleLoginSuccess}
              onNavigateToRegister={() => navigate('/register')}
            />
          } />
          <Route path="/register" element={
            <RegisterPage
              user={user}
              onRegisterSuccess={handleRegisterSuccess}
              onNavigateToLogin={() => navigate('/login')}
            />
          } />
          <Route path="/profile" element={
            user
              ? <ProfilePage user={user} onBackHome={() => navigate('/')} onUserUpdate={(u) => setUser(u)} />
              : <Navigate to="/login" replace />
          } />
          <Route path="/word-challenge" element={
            <WordChallengeRoute user={user} onCreateGuest={handleCreateGuest} navigate={navigate} />
          } />
          <Route path="/word-learn" element={
            <FlashcardLearnPage challengeType="word" onBackHome={() => navigate('/')} user={user} onNavigateToLogin={() => navigate('/login')} onNavigateToRegister={() => navigate('/register')} onCreateGuest={handleCreateGuest} />
          } />
          <Route path="/verb-challenge" element={
            <VerbChallengePage mode="challenge" onBackHome={() => navigate('/')} user={user} onNavigateToLogin={() => navigate('/login')} onNavigateToRegister={() => navigate('/register')} onCreateGuest={handleCreateGuest} />
          } />
          <Route path="/verb-learn" element={
            <FlashcardLearnPage challengeType="verb" onBackHome={() => navigate('/')} user={user} onNavigateToLogin={() => navigate('/login')} onNavigateToRegister={() => navigate('/register')} onCreateGuest={handleCreateGuest} />
          } />
          <Route path="/idiom-challenge" element={
            <IdiomChallengePage mode="challenge" onBackHome={() => navigate('/')} user={user} onNavigateToLogin={() => navigate('/login')} onNavigateToRegister={() => navigate('/register')} onCreateGuest={handleCreateGuest} />
          } />
          <Route path="/idiom-learn" element={
            <FlashcardLearnPage challengeType="idiom" onBackHome={() => navigate('/')} user={user} onNavigateToLogin={() => navigate('/login')} onNavigateToRegister={() => navigate('/register')} onCreateGuest={handleCreateGuest} />
          } />
          <Route path="/word-stats" element={
            <ChallengeStatsPage challengeType="word" onBackHome={() => navigate('/')} onStartChallenge={() => navigate('/word-challenge')} />
          } />
          <Route path="/verb-stats" element={
            <ChallengeStatsPage challengeType="verb" onBackHome={() => navigate('/')} onStartChallenge={() => navigate('/verb-challenge')} />
          } />
          <Route path="/idiom-stats" element={
            <ChallengeStatsPage challengeType="idiom" onBackHome={() => navigate('/')} onStartChallenge={() => navigate('/idiom-challenge')} />
          } />
          <Route path="/weekly-challenge" element={
            <WeeklyChallengePage
              onBackHome={() => navigate('/')}
              onPlayWeekly={(challenges) => {
                const mapped = challenges
                  .filter((w: any) => w.correct !== true)
                  .map((w: any) => ({
                    id: w.challengeId,
                    port: w.portuguese,
                    fr: { translation: w.translation_fr, note: w.fr_note ?? '', use_exemple: w.fr_use_exemple ?? undefined, port_exemple: w.fr_port_exemple ?? undefined },
                    en: { translation: w.translation_en, note: w.en_note ?? '', use_exemple: w.en_use_exemple ?? undefined, port_exemple: w.en_port_exemple ?? undefined },
                  }));
                navigate('/word-challenge', { state: { active: true, challenges: mapped } as WeeklyRouteState });
              }}
            />
          } />
          <Route path="/weekly-story" element={<WeeklyStoryPage onBackHome={() => navigate('/')} />} />
          {/* Catch-all: redirect unknown paths to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Box>
    </>
  );
};

// Separate component so it can read location.state for weekly challenge context
const WordChallengeRoute: React.FC<{
  user: User | null;
  onCreateGuest: () => Promise<User | null>;
  navigate: ReturnType<typeof useNavigate>;
}> = ({ user, onCreateGuest, navigate }) => {
  const location = useLocation();
  const weeklyState = location.state as WeeklyRouteState | null;

  return (
    <ChallengePage
      mode="challenge"
      onBackHome={() => {
        if (weeklyState?.active) {
          navigate('/weekly-challenge', { replace: true });
        } else {
          navigate('/');
        }
      }}
      user={user}
      onNavigateToLogin={() => navigate('/login')}
      onNavigateToRegister={() => navigate('/register')}
      onCreateGuest={onCreateGuest}
      preloadedChallenges={weeklyState?.active ? weeklyState.challenges : undefined}
      onAnswerChecked={weeklyState?.active ? (challengeId, correct) => {
        fetch('/api/weekly-challenge/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ challengeId, correct }),
        }).catch(() => {});
      } : undefined}
    />
  );
};

const App: React.FC = () => (
  <BrowserRouter>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppContent />
    </ThemeProvider>
  </BrowserRouter>
);

export default App;
