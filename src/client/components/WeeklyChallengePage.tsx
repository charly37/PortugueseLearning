import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Container,
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  LinearProgress,
  Grid,
  Chip,
  Alert,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';

interface WeeklyWord {
  challengeId: string;
  portuguese: string;
  translation_fr: string;
  translation_en: string;
  completed: boolean;
  correct: boolean | null;
}

interface WeeklyChallenge {
  _id: string;
  weekStart: string;
  weekEnd: string;
  totalChallenges: number;
  completedCount: number;
  correctCount: number;
  status: 'active' | 'completed' | 'expired';
  challenges: WeeklyWord[];
}

interface WeeklyChallengePageProps {
  onBackHome: () => void;
  onPlayWeekly: (challenges: WeeklyWord[]) => void;
}

const WeeklyChallengePage: React.FC<WeeklyChallengePageProps> = ({
  onBackHome,
  onPlayWeekly,
}) => {
  const { t } = useTranslation();
  const [weekly, setWeekly] = useState<WeeklyChallenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    fetchWeeklyChallenge();
  }, []);

  const fetchWeeklyChallenge = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/weekly-challenge', { credentials: 'include' });
      if (res.status === 404) {
        setError(t('weeklyChallenge.notFound'));
        return;
      }
      if (!res.ok) {
        setError(t('weeklyChallenge.error'));
        return;
      }
      const data = await res.json();
      setWeekly(data);
    } catch {
      setError(t('weeklyChallenge.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/weekly-challenge/reset', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setResetDialogOpen(false);
        await fetchWeeklyChallenge();
      } else {
        setError(t('weeklyChallenge.resetError'));
      }
    } catch {
      setError(t('weeklyChallenge.resetError'));
    } finally {
      setResetting(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  // Progress reflects mastered (correctly answered) words, not merely attempted ones
  const progressPct = weekly
    ? Math.round((weekly.correctCount / weekly.totalChallenges) * 100)
    : 0;

  return (
    <Box sx={{ pt: 10, pb: 6, bgcolor: 'background.default', minHeight: '100vh' }}>
      <Container maxWidth="md">
        {/* Back button */}
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={onBackHome}
          sx={{ mb: 3 }}
        >
          {t('common.back')}
        </Button>

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
          <EmojiEventsIcon sx={{ fontSize: 40, color: '#f59e0b' }} />
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              {t('weeklyChallenge.title')}
            </Typography>
            {weekly && (
              <Typography variant="body2" color="text.secondary">
                <CalendarTodayIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
                {formatDate(weekly.weekStart)} – {formatDate(weekly.weekEnd)}
              </Typography>
            )}
          </Box>
        </Box>

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {error && !loading && (
          <Alert severity="info" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {weekly && !loading && (
          <>
            {/* Progress card */}
            <Paper elevation={2} sx={{ p: 3, mb: 4 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {t('weeklyChallenge.progress')}
                </Typography>
                <Chip
                  label={weekly.status === 'completed'
                    ? t('weeklyChallenge.statusCompleted')
                    : t('weeklyChallenge.statusActive')}
                  color={weekly.status === 'completed' ? 'success' : 'primary'}
                  size="small"
                />
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                  {t('weeklyChallenge.correct', {
                    count: weekly.correctCount,
                    total: weekly.totalChallenges,
                  })}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {progressPct}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={progressPct}
                sx={{ height: 10, borderRadius: 5, mb: 2 }}
                color={weekly.status === 'completed' ? 'success' : 'primary'}
              />

              <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                {weekly.status !== 'completed' && (
                  <Button
                    variant="contained"
                    startIcon={<PlayArrowIcon />}
                    onClick={() => onPlayWeekly(weekly.challenges)}
                  >
                    {weekly.completedCount === 0
                      ? t('weeklyChallenge.startChallenge')
                      : t('weeklyChallenge.continueChallenge')}
                  </Button>
                )}
                {weekly.status === 'completed' && (
                  <Typography variant="body1" color="success.main" sx={{ fontWeight: 600 }}>
                    🎉 {t('weeklyChallenge.allDone')}
                  </Typography>
                )}
                {weekly.completedCount > 0 && (
                  <Button
                    variant="outlined"
                    color="warning"
                    startIcon={<RestartAltIcon />}
                    onClick={() => setResetDialogOpen(true)}
                    size="small"
                  >
                    {t('weeklyChallenge.resetButton')}
                  </Button>
                )}
              </Box>

              {/* Reset confirmation dialog */}
              <Dialog open={resetDialogOpen} onClose={() => setResetDialogOpen(false)}>
                <DialogTitle>{t('weeklyChallenge.resetDialogTitle')}</DialogTitle>
                <DialogContent>
                  <DialogContentText>
                    {t('weeklyChallenge.resetDialogBody')}
                  </DialogContentText>
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setResetDialogOpen(false)} disabled={resetting}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    onClick={handleReset}
                    color="warning"
                    variant="contained"
                    disabled={resetting}
                  >
                    {t('weeklyChallenge.resetConfirm')}
                  </Button>
                </DialogActions>
              </Dialog>
            </Paper>

            {/* Word list */}
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              {t('weeklyChallenge.wordList')}
            </Typography>
            <Grid container spacing={1.5}>
              {weekly.challenges.map((word, idx) => (
                <Grid key={word.challengeId} size={{ xs: 6, sm: 4, md: 3 }}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 1.5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      border: '1px solid',
                      borderColor: word.correct === true
                        ? 'success.light'
                        : word.completed
                        ? 'error.light'
                        : 'divider',
                      bgcolor: word.correct === true
                        ? 'success.50'
                        : word.completed
                        ? 'error.50'
                        : 'background.paper',
                    }}
                  >
                    {word.correct === true ? (
                      <CheckCircleIcon sx={{ fontSize: 18, color: 'success.main', flexShrink: 0 }} />
                    ) : word.completed ? (
                      <CancelIcon sx={{ fontSize: 18, color: 'error.main', flexShrink: 0 }} />
                    ) : (
                      <RadioButtonUncheckedIcon
                        sx={{ fontSize: 18, color: 'text.disabled', flexShrink: 0 }}
                      />
                    )}
                    <Box>
                      <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
                        #{idx + 1}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {word.portuguese}
                      </Typography>
                    </Box>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </>
        )}
      </Container>
    </Box>
  );
};

export default WeeklyChallengePage;
