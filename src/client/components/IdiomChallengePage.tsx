import React, { useState, useEffect, useRef } from 'react';
import { Container, Box, Typography, Button, Card, CardContent, CircularProgress, TextField, Alert, Chip, List, ListItem, ListItemText, Divider, Slider } from '@mui/material';
import { useTranslation } from 'react-i18next';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import TimerIcon from '@mui/icons-material/Timer';
import InfoIcon from '@mui/icons-material/Info';
import { submitChallengeAttempt, normalizeString } from '../utils/challengeUtils';

interface IdiomChallenge {
  id: string;
  port: string;
  fr: { translation: string; note: string };
  en: { translation: string; note: string };
  source?: 'weakness' | 'random';
}

interface AttemptDetail {
  challengeId: string;
  userAnswer: string;
  correctAnswer: string;
  correct: boolean;
  timeSpent: number;
}

interface User {
  id: string;
  username: string;
  email?: string;
  isGuest?: boolean;
  preferredLanguage?: 'fr' | 'en';
}

interface IdiomChallengePageProps {
  mode: 'practice' | 'challenge';
  onBackHome: () => void;
  user: User | null;
  onNavigateToLogin: () => void;
  onNavigateToRegister: () => void;
  onCreateGuest?: () => Promise<User | null>;
}

const IdiomChallengePage: React.FC<IdiomChallengePageProps> = ({ mode, onBackHome, user, onNavigateToLogin, onNavigateToRegister, onCreateGuest }) => {
  const { t } = useTranslation();
  const [challenge, setChallenge] = useState<IdiomChallenge | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [turnCount, setTurnCount] = useState(0);
  const [challengeComplete, setChallengeComplete] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [attemptHistory, setAttemptHistory] = useState<AttemptDetail[]>([]);
  const [maxTurns, setMaxTurns] = useState<number>(20);
  const [difficulty, setDifficulty] = useState<number>(5);
  const [challengeStarted, setChallengeStarted] = useState(mode === 'practice');
  const [generatedChallenges, setGeneratedChallenges] = useState<IdiomChallenge[]>([]);
  const [currentChallengeIndex, setCurrentChallengeIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get user's preferred language or default to 'fr'
  const preferredLanguage = user?.preferredLanguage || 
    (localStorage.getItem('preferredLanguage') as 'fr' | 'en') || 'fr';

  const generateChallengeSet = async () => {
    setLoading(true);
    setError(null);
    try {
      const weaknessWeight = difficulty / 10;
      const response = await fetch('/api/challenge/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          challengeType: 'idiom',
          totalTurns: maxTurns,
          weaknessWeight: weaknessWeight
        })
      });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please log in to use personalized challenges');
        }
        throw new Error('Failed to generate challenge set');
      }
      const data = await response.json();
      setGeneratedChallenges(data.challenges);
      setCurrentChallengeIndex(0);
      setChallenge(data.challenges[0]);
      setChallengeStarted(true);
      setStartTime(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleStartAsGuest = async () => {
    if (onCreateGuest) {
      setLoading(true);
      const guestUser = await onCreateGuest();
      setLoading(false);
      if (!guestUser) {
        setError('Failed to create guest account');
      }
      // Don't start the challenge yet - let the user configure it first
      // The component will re-render with user set, showing the configuration screen
    }
  };

  const fetchChallenge = async () => {
    setLoading(true);
    setError(null);
    setUserAnswer('');
    setFeedback(null);
    setShowAnswer(false);
    setStartTime(Date.now());
    
    if (mode === 'challenge' && generatedChallenges.length > 0) {
      const nextIndex = currentChallengeIndex + 1;
      if (nextIndex < generatedChallenges.length) {
        setCurrentChallengeIndex(nextIndex);
        setChallenge(generatedChallenges[nextIndex]);
      }
      setLoading(false);
    } else {
      try {
        const response = await fetch('/api/idiom-challenge');
        if (!response.ok) {
          throw new Error('Failed to fetch idiom challenge');
        }
        const data = await response.json();
        setChallenge(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }
  };

  const checkAnswer = async () => {
    if (!challenge || !userAnswer.trim()) return;

    const normalizedAnswer = normalizeString(userAnswer);
    const normalizedCorrect = normalizeString(challenge.port);
    const isCorrect = normalizedAnswer === normalizedCorrect;
    const timeSpent = Date.now() - startTime;

    if (isCorrect) {
      setFeedback({ type: 'success', message: `${t('challenge.correct')} ${challenge.port}` });
      setShowAnswer(true);
    } else {
      setFeedback({ type: 'error', message: `${t('challenge.incorrect')} ${challenge.port}` });
      setShowAnswer(true);
    }

    // Submit attempt if user is logged in
    await submitChallengeAttempt(
      challenge.id,
      'idiom',
      isCorrect,
      userAnswer.trim(),
      challenge.port,
      timeSpent
    );

    // Increment turn count and check if challenge mode is complete
    if (mode === 'challenge') {
      const newTurnCount = turnCount + 1;
      setTurnCount(newTurnCount);
      if (isCorrect) {
        setCorrectCount(correctCount + 1);
      } else {
        setIncorrectCount(incorrectCount + 1);
      }
      
      // Store attempt details
      setAttemptHistory([...attemptHistory, {
        challengeId: challenge[preferredLanguage].translation,
        userAnswer: userAnswer.trim(),
        correctAnswer: challenge.port,
        correct: isCorrect,
        timeSpent: timeSpent
      }]);
      
      if (newTurnCount >= maxTurns) {
        setChallengeComplete(true);
      }
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !showAnswer) {
      checkAnswer();
    }
  };

  // Focus input when new challenge loads
  useEffect(() => {
    if (challenge && !showAnswer) {
      inputRef.current?.focus();
    }
  }, [challenge, showAnswer]);

  // Global keyboard listener for when answer is shown
  useEffect(() => {
    const handleGlobalKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && showAnswer && challenge) {
        fetchChallenge();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyPress);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyPress);
    };
  }, [showAnswer, challenge]);

  return (
    <Box sx={{ pt: 10, pb: 6, bgcolor: 'background.default', minHeight: '100vh' }}>
      <Container maxWidth="md">
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            py: 4,
          }}
        >
          <Chip 
            label={mode === 'challenge' ? t('challenge.idiom.title', { current: turnCount, total: maxTurns }) : t('challenge.idiom.practiceTitle')} 
            color="warning"
            sx={{ mb: 2, color: 'white' }} 
          />
          
          <Typography variant="h3" component="h1" gutterBottom align="center">
            {t('challenge.idiom.header')}
          </Typography>
          
          <Typography variant="body1" color="text.secondary" gutterBottom sx={{ mb: 4 }}>
            {t('challenge.idiom.instruction', { language: preferredLanguage === 'fr' ? 'Français' : 'English' })}
          </Typography>

          {!challengeStarted && mode === 'challenge' && !user && (
            <Card sx={{ width: '100%', maxWidth: 500, mb: 3 }} elevation={3}>
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
                <Button
                  variant="contained"
                  color="warning"
                  size="large"
                  onClick={handleStartAsGuest}
                  fullWidth
                  disabled={loading}
                  sx={{ mb: 2 }}
                >
                  {t('auth.startAsGuest')}
                </Button>
                <Divider sx={{ my: 2 }}>{t('common.or')}</Divider>
                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                  <Button
                    variant="outlined"
                    color="warning"
                    size="medium"
                    onClick={onNavigateToRegister}
                    fullWidth
                  >
                    {t('common.register')}
                  </Button>
                  <Button
                    variant="outlined"
                    color="warning"
                    size="medium"
                    onClick={onNavigateToLogin}
                    fullWidth
                  >
                    {t('common.login')}
                  </Button>
                </Box>
                <Button
                  variant="text"
                  color="warning"
                  size="small"
                  onClick={onBackHome}
                  fullWidth
                >
                  {t('common.back')}
                </Button>
              </CardContent>
            </Card>
          )}

          {!challengeStarted && mode === 'challenge' && user && (
            <Card sx={{ width: '100%', maxWidth: 500, mb: 3 }} elevation={3}>
              <CardContent sx={{ p: 4 }}>
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3, textAlign: 'center' }}>
                  {t('common.configureChallenge')}
                </Typography>
                <Box sx={{ mb: 3 }}>
                  <Typography variant="body2" gutterBottom>
                    {t('common.numberOfRounds')}: {maxTurns}
                  </Typography>
                  <Slider
                    value={maxTurns}
                    onChange={(_, value) => setMaxTurns(value as number)}
                    min={10}
                    max={50}
                    step={5}
                    valueLabelDisplay="auto"
                    sx={{ width: '100%' }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {t('common.numberOfRoundsHelper')}
                  </Typography>
                </Box>
                <Box sx={{ mb: 3 }}>
                  <Typography variant="body2" gutterBottom>
                    {t('common.difficulty')}: {difficulty}/10 ({difficulty === 0 ? 'All random' : difficulty === 10 ? 'All weak areas' : `${difficulty * 10}% weak areas`})
                  </Typography>
                  <Slider
                    value={difficulty}
                    onChange={(_, value) => setDifficulty(value as number)}
                    min={0}
                    max={10}
                    step={1}
                    valueLabelDisplay="auto"
                    sx={{ width: '100%' }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    0 = random idioms, 10 = focus on your weak areas
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button
                    variant="outlined"
                    color="warning"
                    size="large"
                    onClick={onBackHome}
                    fullWidth
                  >
                    {t('common.back')}
                  </Button>
                  <Button
                    variant="contained"
                    color="warning"
                    size="large"
                    onClick={generateChallengeSet}
                    fullWidth
                  >
                    {t('common.startChallenge')}
                  </Button>
                </Box>
              </CardContent>
            </Card>
          )}

          {challengeComplete && (
            <>
              <Alert severity="success" sx={{ mb: 3, maxWidth: 700 }}>
                Challenge completed! You finished all {maxTurns} turns. 🎉
              </Alert>
              <Card sx={{ width: '100%', maxWidth: 700, mb: 3 }} elevation={3}>
                <CardContent sx={{ p: 4 }}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3, textAlign: 'center' }}>
                    Challenge Recap
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-around', mb: 3 }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h3" sx={{ color: 'success.main', fontWeight: 700 }}>
                        {correctCount}
                      </Typography>
                      <Typography variant="body1" color="text.secondary">
                        Correct
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h3" sx={{ color: 'error.main', fontWeight: 700 }}>
                        {incorrectCount}
                      </Typography>
                      <Typography variant="body1" color="text.secondary">
                        Incorrect
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ textAlign: 'center', mb: 3, pb: 3, borderBottom: 1, borderColor: 'divider' }}>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      Success Rate: {((correctCount / maxTurns) * 100).toFixed(1)}%
                    </Typography>
                  </Box>
                  
                  <Typography variant="h6" gutterBottom sx={{ mt: 3, mb: 2 }}>
                    Detailed Results
                  </Typography>
                  <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                    {attemptHistory.map((attempt, index) => (
                      <ListItem 
                        key={index}
                        sx={{ 
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 2,
                          mb: 1,
                          bgcolor: attempt.correct ? 'success.50' : 'error.50',
                          display: 'block',
                          py: 1.5
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                            {attempt.correct ? (
                              <CheckCircleIcon color="success" />
                            ) : (
                              <CancelIcon color="error" />
                            )}
                          </Box>
                          <Box sx={{ flex: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                              <Typography variant="body1" fontWeight="medium">
                                {attempt.challengeId}
                              </Typography>
                              <Chip 
                                icon={<TimerIcon />}
                                label={`${Math.round(attempt.timeSpent / 1000)}s`}
                                size="small"
                                variant="outlined"
                              />
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                              Your answer: <strong>{attempt.userAnswer}</strong>
                            </Typography>
                            {!attempt.correct && (
                              <Typography variant="body2" color="text.secondary">
                                Correct answer: <strong>{attempt.correctAnswer}</strong>
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
              <Button
                variant="contained"
                color="warning"
                size="large"
                onClick={onBackHome}
                sx={{ mb: 4 }}
              >
                {t('common.back')}
              </Button>
            </>
          )}

          {!challenge && !loading && !challengeComplete && challengeStarted && (
            <Button
              variant="contained"
              color="warning"
              size="large"
              onClick={fetchChallenge}
              sx={{ mb: 4 }}
            >
              {mode === 'challenge' ? t('common.startChallenge') : t('common.practice')}
            </Button>
          )}

          {loading && <CircularProgress sx={{ my: 4 }} />}

          {challenge && !challengeComplete && (
            <Card sx={{ width: '100%', maxWidth: 500, mt: 2 }} elevation={3}>
              <CardContent sx={{ p: 4 }}>
                <Box sx={{ textAlign: 'center', mb: 4 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {preferredLanguage === 'fr' ? 'Français' : 'English'}
                  </Typography>
                  <Typography variant="h4" component="div" sx={{ fontWeight: 600, color: 'warning.main' }}>
                    {challenge[preferredLanguage].translation}
                  </Typography>
                </Box>
                
                <TextField
                  fullWidth
                  label={t('common.yourAnswer')}
                  variant="outlined"
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={showAnswer}
                  inputRef={inputRef}
                  sx={{ mb: 2 }}
                />

                {feedback && (
                  <Alert severity={feedback.type} sx={{ mb: 2 }}>
                    {feedback.message}
                  </Alert>
                )}

                {feedback && challenge.fr.note && challenge.fr.note !== "todo" && showAnswer && (
                  <Box sx={{ mt: 2, mb: 2, p: 2, bgcolor: 'info.lighter', borderRadius: 1, border: '1px solid', borderColor: 'info.light' }}>
                    <Typography variant="subtitle2" color="info.dark" gutterBottom sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <InfoIcon fontSize="small" />
                      Note
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {challenge.fr.note}
                    </Typography>
                  </Box>
                )}

                {!showAnswer ? (
                  <Button
                    variant="contained"
                    color="warning"
                    fullWidth
                    size="large"
                    onClick={checkAnswer}
                    disabled={!userAnswer.trim()}
                  >
                    {t('common.checkAnswer')}
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    color="warning"
                    fullWidth
                    size="large"
                    onClick={fetchChallenge}
                  >
                    {t('common.nextChallenge')}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </Box>
      </Container>
    </Box>
  );
};

export default IdiomChallengePage;
