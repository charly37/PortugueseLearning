import React, { useState, useEffect } from 'react';
import { Container, Box, Typography, Button, Grid, Paper, ToggleButton, ToggleButtonGroup, Chip } from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import TranslateIcon from '@mui/icons-material/Translate';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import LanguageIcon from '@mui/icons-material/Language';
import { useTranslation } from 'react-i18next';

interface User {
  id: string;
  username: string;
  email: string;
  preferredLanguage?: 'fr' | 'en';
}

interface LandingPageProps {
  user: User | null;
  onWordPractice: () => void;
  onWordChallenge: () => void;
  onVerbPractice: () => void;
  onVerbChallenge: () => void;
  onIdiomPractice: () => void;
  onIdiomChallenge: () => void;
  onViewProfile: () => void;
  onLogout: () => void;
  onViewWordStats: () => void;
  onViewVerbStats: () => void;
  onViewIdiomStats: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ 
  user, 
  onWordPractice,
  onWordChallenge,
  onVerbPractice,
  onVerbChallenge,
  onIdiomPractice,
  onIdiomChallenge,
  onViewWordStats,
  onViewVerbStats,
  onViewIdiomStats,
}) => {
  const { t, i18n } = useTranslation();
  
  // Initialize language from user preference, localStorage, or default to 'fr'
  const [selectedLanguage, setSelectedLanguage] = useState<'fr' | 'en'>(() => {
    if (user?.preferredLanguage) return user.preferredLanguage;
    const stored = localStorage.getItem('preferredLanguage');
    return (stored === 'fr' || stored === 'en') ? stored : 'fr';
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
          <Typography variant="h2" component="h1" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
            {t('landing.welcome')}{user ? `, ${user.username}` : ''}! 👋
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, justifyContent: 'center' }}>
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
          
          <Typography variant="h5" color="text.secondary" gutterBottom sx={{ maxWidth: '700px', mb: 2 }}>
            {t('landing.hero.title')}
          </Typography>
          
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: '800px', mb: 6 }}>
            {t('landing.hero.subtitle')}
          </Typography>
          
          <Grid container spacing={3} sx={{ maxWidth: '900px' }}>
            <Grid item xs={12} md={4}>
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
                  onClick={onWordPractice}
                  fullWidth
                  sx={{ mb: 1 }}
                >
                  {t('common.practice')}
                </Button>
                <Button
                  variant="outlined"
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

            <Grid item xs={12} md={4}>
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
                  onClick={onVerbPractice}
                  fullWidth
                  sx={{ mb: 1 }}
                >
                  {t('common.practice')}
                </Button>
                <Button
                  variant="outlined"
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

            <Grid item xs={12} md={4}>
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
                  onClick={onIdiomPractice}
                  fullWidth
                  sx={{
                    mb: 1,
                    bgcolor: '#ff9800',
                    '&:hover': {
                      bgcolor: '#f57c00',
                    },
                  }}
                >
                  {t('common.practice')}
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  onClick={onIdiomChallenge}
                  fullWidth
                  sx={{
                    mb: user ? 1 : 0,
                    color: '#ff9800',
                    borderColor: '#ff9800',
                    '&:hover': {
                      borderColor: '#f57c00',
                      bgcolor: '#ff980010',
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
          </Grid>
        </Box>
      </Container>
    </Box>
  );
};

export default LandingPage;
