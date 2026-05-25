import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Container, Box, Typography, Paper, Button, TextField,
  CircularProgress, Alert, LinearProgress, Chip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import { normalizeString } from '../utils/challengeUtils';

interface WeeklyWord {
  challengeId: string;
  portuguese: string;
  translation_fr: string;
  translation_en: string;
  completed: boolean;
  correct: boolean | null;
}

interface WeeklyChallengePlayPageProps {
  challenges: WeeklyWord[];
  preferredLanguage: 'fr' | 'en';
  onBackToWeekly: () => void;
}

type Phase = 'question' | 'feedback' | 'done';

const WeeklyChallengePlayPage: React.FC<WeeklyChallengePlayPageProps> = ({
  challenges,
  preferredLanguage,
  onBackToWeekly,
}) => {
  const { t } = useTranslation();
  const queue = challenges.filter(w => !w.completed);

  const [idx, setIdx] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [phase, setPhase] = useState<Phase>(queue.length === 0 ? 'done' : 'question');
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = queue[idx] ?? null;
  const translation = current
    ? (preferredLanguage === 'fr' ? current.translation_fr : current.translation_en)
    : '';

  const handleCheck = async () => {
    if (!current || submitting) return;
    const answer = userAnswer.trim();
    if (!answer) return;

    const correct = normalizeString(answer) === normalizeString(current.portuguese);
    setLastCorrect(correct);
    setCorrectAnswer(current.portuguese);
    setSubmitting(true);

    try {
      await fetch('/api/weekly-challenge/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ challengeId: current.challengeId, correct }),
      });
    } catch {
      // non-fatal
    } finally {
      setSubmitting(false);
    }

    setSessionTotal(prev => prev + 1);
    if (correct) setSessionCorrect(prev => prev + 1);
    setPhase('feedback');
  };

  const handleNext = () => {
    if (idx + 1 >= queue.length) {
      setPhase('done');
    } else {
      setIdx(i => i + 1);
      setUserAnswer('');
      setLastCorrect(null);
      setPhase('question');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (phase === 'question') handleCheck();
      else if (phase === 'feedback') handleNext();
    }
  };

  const alreadyCompletedCount = challenges.filter(w => w.completed).length;
  const progressDone = alreadyCompletedCount + sessionTotal;
  const progressPct  = Math.round((progressDone / challenges.length) * 100);

  if (phase === 'done') {
    const grandCorrect = challenges.filter(w => w.correct === true).length + sessionCorrect;
    return (
      <Box sx={{ pt: 10, pb: 6, bgcolor: 'background.default', minHeight: '100vh' }}>
        <Container maxWidth="sm">
          <Paper elevation={3} sx={{ p: 5, textAlign: 'center' }}>
            <EmojiEventsIcon sx={{ fontSize: 64, color: '#f59e0b', mb: 2 }} />
            <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
              {t('weeklyPlay.doneTitle')}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
              {t('weeklyPlay.doneSummary', { correct: sessionCorrect, total: queue.length })}
            </Typography>
            {alreadyCompletedCount > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('weeklyPlay.previouslyDone', { count: alreadyCompletedCount })}
              </Typography>
            )}
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'success.main', mb: 4 }}>
              {grandCorrect} / {challenges.length} {t('weeklyPlay.totalCorrect')}
            </Typography>
            <Button
              variant="contained"
              size="large"
              onClick={onBackToWeekly}
              startIcon={<ArrowBackIcon />}
            >
              {t('weeklyPlay.backToOverview')}
            </Button>
          </Paper>
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ pt: 10, pb: 6, bgcolor: 'background.default', minHeight: '100vh' }}>
      <Container maxWidth="sm">
        <Button startIcon={<ArrowBackIcon />} onClick={onBackToWeekly} sx={{ mb: 3 }}>
          {t('common.back')}
        </Button>

        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {t('weeklyPlay.wordN', { current: idx + 1, total: queue.length })}
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {progressPct}%
            </Typography>
          </Box>
          <LinearProgress variant="determinate" value={progressPct} sx={{ height: 8, borderRadius: 4 }} />
        </Box>

        <Paper elevation={2} sx={{ p: 4 }}>
          <Typography variant="overline" color="text.secondary">
            {t('weeklyPlay.prompt')}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 3, mt: 0.5 }}>
            {translation || '—'}
          </Typography>

          <TextField
            inputRef={inputRef}
            label={t('common.yourAnswer')}
            variant="outlined"
            fullWidth
            value={userAnswer}
            onChange={e => setUserAnswer(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={phase === 'feedback' || submitting}
            autoFocus
            sx={{ mb: 2 }}
          />

          {phase === 'feedback' && (
            <Alert
              severity={lastCorrect ? 'success' : 'error'}
              icon={lastCorrect ? <CheckCircleIcon /> : <CancelIcon />}
              sx={{ mb: 2 }}
            >
              {lastCorrect
                ? t('weeklyPlay.correct')
                : t('weeklyPlay.incorrect', { answer: correctAnswer })}
            </Alert>
          )}

          {phase === 'question' ? (
            <Button
              variant="contained"
              size="large"
              fullWidth
              onClick={handleCheck}
              disabled={!userAnswer.trim() || submitting}
            >
              {submitting ? <CircularProgress size={20} /> : t('common.checkAnswer')}
            </Button>
          ) : (
            <Button
              variant="contained"
              size="large"
              fullWidth
              onClick={handleNext}
              color={lastCorrect ? 'success' : 'primary'}
            >
              {idx + 1 < queue.length ? t('common.nextChallenge') : t('weeklyPlay.seeResults')}
            </Button>
          )}
        </Paper>

        {sessionTotal > 0 && (
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
            <Chip
              label={`${sessionCorrect} / ${sessionTotal} ${t('weeklyPlay.thisSession')}`}
              color={sessionCorrect === sessionTotal ? 'success' : 'default'}
            />
          </Box>
        )}
      </Container>
    </Box>
  );
};

export default WeeklyChallengePlayPage;
