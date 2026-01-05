import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Container,
  Box,
  Typography,
  Paper,
  Avatar,
  Divider,
  Stack,
  Button,
  Grid,
  LinearProgress,
  Chip,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton,
  Alert,
  Snackbar
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import EmailIcon from '@mui/icons-material/Email';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import LanguageIcon from '@mui/icons-material/Language';

interface User {
  id: string;
  username: string;
  email?: string;
  isGuest?: boolean;
  preferredLanguage?: 'fr' | 'en';
  createdAt?: string;
  totalScore?: number;
  level?: number;
}

interface ChallengeProgress {
  totalAttempts: number;
  correctAnswers: number;
  accuracy: number;
  streak: number;
  completedChallenges: number;
  lastAttemptDate?: string;
}

interface Progress {
  totalScore: number;
  level: number;
  word: ChallengeProgress;
  idiom: ChallengeProgress;
  verb: ChallengeProgress;
}

interface ProfilePageProps {
  user: User | null;
  onBackHome: () => void;
}

const ProfilePage: React.FC<ProfilePageProps> = ({ user, onBackHome }) => {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [preferredLanguage, setPreferredLanguage] = useState<'fr' | 'en'>(user?.preferredLanguage || 'fr');
  const [updateSuccess, setUpdateSuccess] = useState(false);

  useEffect(() => {
    const fetchProgress = async () => {
      try {
        const response = await fetch('/api/challenge/progress', {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          setProgress(data);
        }
      } catch (error) {
        console.error('Error fetching progress:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchProgress();
      setPreferredLanguage(user.preferredLanguage || 'fr');
    }
  }, [user]);

  const handleLanguageChange = async (_: React.MouseEvent<HTMLElement>, newLanguage: 'fr' | 'en' | null) => {
    if (!newLanguage) return;
    
    setPreferredLanguage(newLanguage);
    localStorage.setItem('preferredLanguage', newLanguage);

    try {
      const response = await fetch('/api/auth/update-language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ preferredLanguage: newLanguage })
      });

      if (response.ok) {
        setUpdateSuccess(true);
      }
    } catch (error) {
      console.error('Failed to update language preference:', error);
    }
  };

  if (!user) {
    return null;
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const renderChallengeStats = (type: string, data: ChallengeProgress, color: string) => (
    <Paper
      variant="outlined"
      sx={{
        p: 3,
        height: '100%',
        background: `linear-gradient(135deg, ${color}15 0%, transparent 100%)`,
        border: `2px solid ${color}40`
      }}
    >
      <Typography variant="h6" gutterBottom sx={{ color, fontWeight: 'bold' }}>
        {type === 'word' ? t('profile.wordChallenges') : type === 'idiom' ? t('profile.idiomChallenges') : t('profile.verbChallenges')}
      </Typography>
      
      <Stack spacing={2}>
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t('profile.accuracy')}
            </Typography>
            <Typography variant="body2" fontWeight="bold">
              {data.accuracy}%
            </Typography>
          </Box>
          <LinearProgress 
            variant="determinate" 
            value={data.accuracy} 
            sx={{ 
              height: 8, 
              borderRadius: 4,
              backgroundColor: `${color}20`,
              '& .MuiLinearProgress-bar': {
                backgroundColor: color
              }
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {t('profile.attempts')}
            </Typography>
            <Typography variant="h6">
              {data.totalAttempts}
            </Typography>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {t('profile.correct')}
            </Typography>
            <Typography variant="h6" color="success.main">
              {data.correctAnswers}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {t('profile.streak')}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <LocalFireDepartmentIcon sx={{ color: 'orange', fontSize: 20 }} />
              <Typography variant="h6">
                {data.streak}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {t('profile.completed')}
            </Typography>
            <Typography variant="h6">
              {data.completedChallenges}
            </Typography>
          </Box>
        </Box>
      </Stack>
    </Paper>
  );

  return (
    <Container maxWidth="md">
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          py: 4,
        }}
      >
        <Paper
          elevation={3}
          sx={{
            width: '100%',
            maxWidth: 600,
            p: 4,
            borderRadius: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={onBackHome}
              sx={{ mr: 2 }}
            >
              {t('common.back')}
            </Button>
            <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>
              {t('profile.title')}
            </Typography>
          </Box>

          <Divider sx={{ mb: 4 }} />

          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4 }}>
            <Avatar
              sx={{
                width: 120,
                height: 120,
                bgcolor: 'primary.main',
                fontSize: '3rem',
                mb: 2,
              }}
            >
              {user.username.charAt(0).toUpperCase()}
            </Avatar>
            <Typography variant="h4" gutterBottom>
              {user.username}
            </Typography>
            {progress && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Chip 
                  icon={<EmojiEventsIcon />}
                  label={`${t('common.level')} ${progress.level}`} 
                  color="primary" 
                  size="medium"
                />
                <Chip 
                  icon={<TrendingUpIcon />}
                  label={`${progress.totalScore} ${t('common.points')}`} 
                  color="success" 
                  size="medium"
                />
              </Box>
            )}
          </Box>

          <Stack spacing={3}>
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <PersonIcon color="primary" sx={{ fontSize: 32 }} />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('profile.username')}
                </Typography>
                <Typography variant="body1" fontWeight="medium">
                  {user.username}
                </Typography>
              </Box>
            </Paper>

            <Paper
              variant="outlined"
              sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <EmailIcon color="primary" sx={{ fontSize: 32 }} />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('profile.email')}
                </Typography>
                <Typography variant="body1" fontWeight="medium">
                  {user.email}
                </Typography>
              </Box>
            </Paper>

            <Paper
              variant="outlined"
              sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <CalendarTodayIcon color="primary" sx={{ fontSize: 32 }} />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('profile.createdOn')}
                </Typography>
                <Typography variant="body1" fontWeight="medium">
                  {formatDate(user.createdAt)}
                </Typography>
              </Box>
            </Paper>

            <Paper
              variant="outlined"
              sx={{
                p: 2,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <LanguageIcon color="primary" sx={{ fontSize: 32 }} />
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    I speak (source language)
                  </Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {preferredLanguage === 'fr' ? '🇫🇷 Français' : '🇬🇧 English'}
                  </Typography>
                </Box>
              </Box>
              <ToggleButtonGroup
                value={preferredLanguage}
                exclusive
                onChange={handleLanguageChange}
                aria-label="preferred language"
                fullWidth
                size="small"
              >
                <ToggleButton value="fr" aria-label="French">
                  🇫🇷 Français
                </ToggleButton>
                <ToggleButton value="en" aria-label="English">
                  🇬🇧 English
                </ToggleButton>
              </ToggleButtonGroup>
            </Paper>
          </Stack>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
              <CircularProgress />
            </Box>
          ) : progress ? (
            <>
              <Divider sx={{ my: 4 }}>
                <Chip label="Learning Progress" color="primary" />
              </Divider>

              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  {renderChallengeStats('word', progress.word, '#1976d2')}
                </Grid>
                <Grid item xs={12} md={4}>
                  {renderChallengeStats('idiom', progress.idiom, '#9c27b0')}
                </Grid>
                <Grid item xs={12} md={4}>
                  {renderChallengeStats('verb', progress.verb, '#2e7d32')}
                </Grid>
              </Grid>
            </>
          ) : null}

          <Box sx={{ mt: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Keep learning and improving your Portuguese skills!
            </Typography>
          </Box>
        </Paper>

        <Snackbar 
          open={updateSuccess} 
          autoHideDuration={3000} 
          onClose={() => setUpdateSuccess(false)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert onClose={() => setUpdateSuccess(false)} severity="success" sx={{ width: '100%' }}>
            Language preference updated successfully!
          </Alert>
        </Snackbar>
      </Box>
    </Container>
  );
};

export default ProfilePage;
