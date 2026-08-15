import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Container,
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Card,
  CardContent,
  Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';

interface Sentence {
  pt: string;
  fr: string;
}

interface Story {
  title_pt: string;
  title_fr: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  topic: string;
  sentences: Sentence[];
  created_at: string;
}

interface WeeklyStoryData {
  weekStart: string;
  weekEnd: string;
  status: string;
  story: Story;
}

interface WeeklyStoryPageProps {
  onBackHome: () => void;
  user: { id: string; username: string; isGuest?: boolean } | null;
  onCreateGuest: () => Promise<{ id: string; username: string; isGuest?: boolean } | null>;
}

const LEVEL_COLOR: Record<string, 'success' | 'warning' | 'error'> = {
  beginner: 'success',
  intermediate: 'warning',
  advanced: 'error',
};

const WeeklyStoryPage: React.FC<WeeklyStoryPageProps> = ({ onBackHome, user, onCreateGuest }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState<WeeklyStoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'notFound' | 'error' | null>(null);

  const fetchStory = () => {
    fetch('/api/weekly-story', { credentials: 'include' })
      .then(res => {
        if (res.status === 404) { setError('notFound'); return null; }
        if (!res.ok)            { setError('error');    return null; }
        return res.json();
      })
      .then(json => json && setData(json))
      .catch(() => setError('error'))
      .finally(() => setLoading(false));
  };

  const handleStartAsGuest = async () => {
    setLoading(true);
    const guestUser = await onCreateGuest();
    setLoading(false);
    if (guestUser) fetchStory();
  };

  useEffect(() => {
    if (user) fetchStory();
    else setLoading(false);
  }, []);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
      day: 'numeric',
      month: 'long',
    });

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

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {!user && !loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <Card sx={{ width: '100%', maxWidth: 500 }} elevation={3}>
              <CardContent sx={{ p: 4 }}>
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3, textAlign: 'center' }}>
                  {t('auth.startChallenge')}
                </Typography>
                <Typography variant="body1" sx={{ mb: 3, textAlign: 'center' }}>
                  {t('auth.guestWelcome')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
                  {t('auth.guestExplanation')}
                </Typography>
                <Button variant="contained" color="primary" size="large" onClick={handleStartAsGuest} fullWidth sx={{ mb: 2 }}>
                  {t('auth.startAsGuestStory')}
                </Button>
                <Divider sx={{ my: 2 }}>{t('common.or')}</Divider>
                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                  <Button variant="outlined" color="primary" size="medium" onClick={() => navigate('/register')} fullWidth>
                    {t('common.register')}
                  </Button>
                  <Button variant="outlined" color="primary" size="medium" onClick={() => navigate('/login')} fullWidth>
                    {t('common.login')}
                  </Button>
                </Box>
                <Button variant="text" color="primary" size="small" onClick={onBackHome} fullWidth>
                  {t('common.back')}
                </Button>
              </CardContent>
            </Card>
          </Box>
        )}

        {!loading && error === 'notFound' && (
          <Alert severity="info">{t('weeklyStory.notFound')}</Alert>
        )}

        {!loading && error === 'error' && (
          <Alert severity="error">{t('weeklyStory.error')}</Alert>
        )}

        {!loading && data && (
          <>
            {/* Header */}
            <Paper
              elevation={2}
              sx={{
                p: 4,
                mb: 3,
                borderLeft: '4px solid #10b981',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 3,
              }}
            >
              <AutoStoriesIcon sx={{ fontSize: 48, color: '#10b981', flexShrink: 0, mt: 0.5 }} />
              <Box sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                  <Chip
                    label={t(`weeklyStory.level.${data.story.level}`)}
                    color={LEVEL_COLOR[data.story.level] ?? 'default'}
                    size="small"
                  />
                  {data.story.topic && (
                    <Chip label={data.story.topic} size="small" variant="outlined" />
                  )}
                  <Chip
                    icon={<CalendarTodayIcon sx={{ fontSize: '0.8rem !important' }} />}
                    label={`${formatDate(data.weekStart)} – ${formatDate(data.weekEnd)}`}
                    size="small"
                    variant="outlined"
                  />
                </Box>
                <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
                  {data.story.title_pt}
                </Typography>
                <Typography variant="subtitle1" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  {data.story.title_fr}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  {t('weeklyStory.sentenceCount', { count: data.story.sentences.length })}
                </Typography>
              </Box>
            </Paper>

            {/* Sentences */}
            {data.story.sentences.map((sentence, index) => (
              <Paper
                key={index}
                elevation={1}
                sx={{
                  p: 3,
                  mb: 2,
                  display: 'flex',
                  gap: 2,
                  alignItems: 'flex-start',
                  '&:hover': { boxShadow: 3 },
                  transition: 'box-shadow 0.2s',
                }}
              >
                {/* Sentence number */}
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    bgcolor: '#10b981',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    mt: 0.25,
                  }}
                >
                  {index + 1}
                </Box>

                <Box>
                  {/* Portuguese */}
                  <Typography
                    variant="body1"
                    sx={{ fontWeight: 600, fontSize: '1.05rem', lineHeight: 1.5 }}
                  >
                    {sentence.pt}
                  </Typography>
                  {/* Translation */}
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.5, fontStyle: 'italic', lineHeight: 1.5 }}
                  >
                    {sentence.fr}
                  </Typography>
                </Box>
              </Paper>
            ))}
          </>
        )}
      </Container>
    </Box>
  );
};

export default WeeklyStoryPage;
