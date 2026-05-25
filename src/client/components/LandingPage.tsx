import React, { useState, useEffect } from 'react';
import { Container, Box, Typography, Button, Grid, Paper, ToggleButton, ToggleButtonGroup, Chip, LinearProgress } from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import TranslateIcon from '@mui/icons-material/Translate';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import LanguageIcon from '@mui/icons-material/Language';
import StyleIcon from '@mui/icons-material/Style';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import { useTranslation } from 'react-i18next';

interface User {
  id: string;
  username: string;
  email?: string;
  isGuest?: boolean;
  preferredLanguage?: 'fr' | 'en';
}

interface WeeklySummary {
  completedCount: number;
  totalChallenges: number;
  status: 'active' | 'completed' | 'expired';
}

interface LandingPageProps {
  user: User | null;
  onWordChallenge: () => void;
  onWordLearn: () => void;
  onVerbChallenge: () => void;
  onVerbLearn: () => void;
  onIdiomChallenge: () => void;
  onIdiomLearn: () => void;
  onViewProfile: () => void;
  onLogout: () => void;
  onViewWordStats: () => void;
  onViewVerbStats: () => void;
  onViewIdiomStats: () => void;
  onWeeklyChallenge: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ 
  user, 
  onWordChallenge,
  onWordLearn,
  onVerbChallenge,
  onVerbLearn,
  onIdiomChallenge,
  onIdiomLearn,
  onViewWordStats,
  onViewVerbStats,
  onViewIdiomStats,
  onWeeklyChallenge,
}) => {
  const { t, i18n } = useTranslation();
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);

  // Fetch weekly challenge progress for logged-in non-guest users
  useEffect(() => {
    if (user && !user.isGuest) {
      fetch('/api/weekly-challenge', { credentials: 'include' })
        .then(res => res.ok ? res.json() : null)
        .then(data => data && setWeeklySummary(data))
        .catch(() => {});
    } else {
      setWeeklySummary(null);
    }
  }, [user]);

  // Initialize language from user preference, localStorage, or detected language
  const [selectedLanguage, setSelectedLanguage] = useState<'fr' | 'en'>(() => {
    if (user?.preferredLanguage) return user.preferredLanguage;
    const stored = localStorage.getItem('preferredLanguage');
    if (stored === 'fr' || stored === 'en') return stored;
    // Use the language detected by i18n (from browser)
    return i18n.language === 'en' ? 'en' : 'fr';
  });

  // Update language when user changes
  useEffect(() => {
    if (user?.preferredLanguage) {
      setSelectedLanguage(user.preferredLanguage);
    }
  }, [user?.preferredLanguage]);

  const handleLanguageChange = async (_: React.MouseEvent<HTMLElement>, newLanguage: 'fr' | 'en' | null) => {
    if (!newLanguage) return;
    
    setSelectedLanguage(newLanguage);
    localStorage.setItem('preferredLanguage', newLanguage);
    i18n.changeLanguage(newLanguage);

    // Update user preference if logged in
    if (user) {
      try {
        await fetch('/api/auth/update-language', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ preferredLanguage: newLanguage })
        });
      } catch (error) {
        console.error('Failed to update language preference:', error);
      }
    }
  };

  const languageNames = {
    fr: 'French',
    en: 'English'
  };

  return (
    <Box sx={{ pt: 10, pb: 6, bgcolor: 'background.default', minHeight: '100vh' }}>
      <Container maxWidth="lg">
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            py: 6,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 6, justifyContent: 'center' }}>
            <LanguageIcon color="action" />
            <Typography variant="body1" color="text.secondary">
              {t('landing.iSpeak')}
            </Typography>
            <ToggleButtonGroup
              value={selectedLanguage}
              exclusive
              onChange={handleLanguageChange}
              aria-label="source language"
              size="small"
            >
              <ToggleButton value="fr" aria-label="French">
                🇫🇷 Français
              </ToggleButton>
              <ToggleButton value="en" aria-label="English">
                🇬🇧 English
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
          
          <Grid container spacing={3} sx={{ maxWidth: '900px' }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper
                elevation={2}
                sx={{
                  p: 4,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                  },
                }}
              >
                <TranslateIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
                  {t('landing.challenges.word.title')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3, flexGrow: 1 }}>
                  {t('landing.challenges.word.description', { language: languageNames[selectedLanguage] })}
                </Typography>
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  onClick={onWordLearn}
                  fullWidth
                  sx={{ mb: 1 }}
                  startIcon={<StyleIcon />}
                >
                  {t('common.learn')}
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  onClick={onWordChallenge}
                  fullWidth
                  sx={{ mb: user ? 1 : 0 }}
                >
                  {t('common.challenge')}
                </Button>
                {user && (
                  <Button
                    variant="outlined"
                    color="primary"
                    size="medium"
                    onClick={onViewWordStats}
                    fullWidth
                  >
                    {t('common.myStats')}
                  </Button>
                )}
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Paper
                elevation={2}
                sx={{
                  p: 4,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                  },
                }}
              >
                <SchoolIcon sx={{ fontSize: 48, color: 'secondary.main', mb: 2 }} />
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
                  {t('landing.challenges.verb.title')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3, flexGrow: 1 }}>
                  {t('landing.challenges.verb.description')}
                </Typography>
                <Button
                  variant="contained"
                  color="secondary"
                  size="large"
                  onClick={onVerbLearn}
                  fullWidth
                  sx={{ mb: 1 }}
                  startIcon={<StyleIcon />}
                >
                  {t('common.learn')}
                </Button>
                <Button
                  variant="contained"
                  color="secondary"
                  size="large"
                  onClick={onVerbChallenge}
                  fullWidth
                  sx={{ mb: user ? 1 : 0 }}
                >
                  {t('common.challenge')}
                </Button>
                {user && (
                  <Button
                    variant="outlined"
                    color="secondary"
                    size="medium"
                    onClick={onViewVerbStats}
                    fullWidth
                  >
                    {t('common.myStats')}
                  </Button>
                )}
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Paper
                elevation={2}
                sx={{
                  p: 4,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                  },
                }}
              >
                <RecordVoiceOverIcon sx={{ fontSize: 48, color: '#ff9800', mb: 2 }} />
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
                  {t('landing.challenges.idiom.title')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3, flexGrow: 1 }}>
                  {t('landing.challenges.idiom.description')}
                </Typography>
                <Button
                  variant="contained"
                  size="large"
                  onClick={onIdiomLearn}
                  fullWidth
                  sx={{
                    mb: 1,
                    bgcolor: '#ff9800',
                    '&:hover': {
                      bgcolor: '#f57c00',
                    },
                  }}
                  startIcon={<StyleIcon />}
                >
                  {t('common.learn')}
                </Button>
                <Button
                  variant="contained"
                  size="large"
                  onClick={onIdiomChallenge}
                  fullWidth
                  sx={{
                    mb: user ? 1 : 0,
                    bgcolor: '#ff9800',
                    '&:hover': {
                      bgcolor: '#f57c00',
                    },
                  }}
                >
                  {t('common.challenge')}
                </Button>
                {user && (
                  <Button
                    variant="outlined"
                    size="medium"
                    onClick={onViewIdiomStats}
                    fullWidth
                    sx={{
                      color: '#ff9800',
                      borderColor: '#ff9800',
                      '&:hover': {
                        borderColor: '#f57c00',
                        bgcolor: '#ff980010',
                      },
                    }}
                  >
                    {t('common.myStats')}
                  </Button>
                )}
              </Paper>
            </Grid>

            {/* Weekly Challenge card — full-width row below the three cards */}
            <Grid size={{ xs: 12 }}>
              <Paper
                elevation={2}
                sx={{
                  p: 4,
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  alignItems: { xs: 'flex-start', sm: 'center' },
                  gap: 3,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                  },
                  borderLeft: '4px solid #f59e0b',
                }}
              >
                <EmojiEventsIcon sx={{ fontSize: 48, color: '#f59e0b', flexShrink: 0 }} />

                <Box sx={{ flexGrow: 1, textAlign: 'left' }}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
                    {t('landing.challenges.weekly.title')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('landing.challenges.weekly.description')}
                  </Typography>

                  {/* Progress bar for logged-in users who have a weekly challenge */}
                  {user && !user.isGuest && weeklySummary && (
                    <Box sx={{ mt: 1.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          {t('weeklyChallenge.correct', {
                            count: weeklySummary.completedCount,
                            total: weeklySummary.totalChallenges,
                          })}
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          {Math.round((weeklySummary.completedCount / weeklySummary.totalChallenges) * 100)}%
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={Math.round((weeklySummary.completedCount / weeklySummary.totalChallenges) * 100)}
                        sx={{ height: 8, borderRadius: 4 }}
                        color={weeklySummary.status === 'completed' ? 'success' : 'warning'}
                      />
                    </Box>
                  )}
                </Box>

                <Box sx={{ flexShrink: 0 }}>
                  {!user || user.isGuest ? (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      {t('weeklyChallenge.loginRequired')}
                    </Typography>
                  ) : (
                    <Button
                      variant="contained"
                      size="large"
                      onClick={onWeeklyChallenge}
                      sx={{
                        bgcolor: '#f59e0b',
                        '&:hover': { bgcolor: '#d97706' },
                        minWidth: 160,
                      }}
                      startIcon={<EmojiEventsIcon />}
                    >
                      {t('weeklyChallenge.viewProgress')}
                    </Button>
                  )}
                </Box>
              </Paper>
            </Grid>

          </Grid>
        </Box>
      </Container>
    </Box>
  );
};

export default LandingPage;
