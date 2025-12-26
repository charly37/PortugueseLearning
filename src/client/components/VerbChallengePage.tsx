import React, { useState, useEffect, useRef } from 'react';
import { Container, Box, Typography, Button, Card, CardContent, CircularProgress, TextField, Alert, List, ListItem, ListItemText, Chip, Divider } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import TimerIcon from '@mui/icons-material/Timer';
import { submitChallengeAttempt, normalizeString } from '../utils/challengeUtils';

interface VerbChallenge {
  port: string;
  francais: string;
  present: string[];
}

interface AttemptDetail {
  challengeId: string;
  userAnswer: string;
  correctAnswer: string;
  correct: boolean;
  timeSpent: number;
}

interface VerbChallengePageProps {
  mode: 'practice' | 'challenge';
  onBackHome: () => void;
}

const VerbChallengePage: React.FC<VerbChallengePageProps> = ({ mode, onBackHome }) => {
  const [challenge, setChallenge] = useState<VerbChallenge | null>(null);
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
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchChallenge = async () => {
    setLoading(true);
    setError(null);
    setUserAnswer('');
    setFeedback(null);
    setShowAnswer(false);
    setStartTime(Date.now());
    try {
      const response = await fetch('/api/verb-challenge');
      if (!response.ok) {
        throw new Error('Failed to fetch verb challenge');
      }
      const data = await response.json();
      setChallenge(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const checkAnswer = async () => {
    if (!challenge || !userAnswer.trim()) return;

    const normalizedAnswer = normalizeString(userAnswer);
    const normalizedCorrect = normalizeString(challenge.port);
    const isCorrect = normalizedAnswer === normalizedCorrect;
    const timeSpent = Date.now() - startTime;

    if (isCorrect) {
      setFeedback({ type: 'success', message: `Correct! Well done! 🎉 The answer is: ${challenge.port}` });
      setShowAnswer(true);
    } else {
      setFeedback({ type: 'error', message: `Incorrect. The correct answer is: ${challenge.port}` });
      setShowAnswer(true);
    }

    // Submit attempt if user is logged in
    await submitChallengeAttempt(
      challenge.francais,
      'verb',
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
        challengeId: challenge.francais,
        userAnswer: userAnswer.trim(),
        correctAnswer: challenge.port,
        correct: isCorrect,
        timeSpent: timeSpent
      }]);
      
      if (newTurnCount >= 20) {
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
            label={mode === 'challenge' ? `Verb Challenge - Turn ${turnCount}/20` : 'Verb Practice'} 
            color="secondary" 
            sx={{ mb: 2 }} 
          />
          
          <Typography variant="h3" component="h1" gutterBottom align="center">
            Portuguese Verbs
          </Typography>
          
          <Typography variant="body1" color="text.secondary" gutterBottom sx={{ mb: 4 }}>
            Translate verbs from French to Portuguese
          </Typography>

          {challengeComplete && (
            <>
              <Alert severity="success" sx={{ mb: 3, maxWidth: 700 }}>
                Challenge completed! You finished all 20 turns. 🎉
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
                      Success Rate: {((correctCount / 20) * 100).toFixed(1)}%
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
                color="secondary"
                size="large"
                onClick={onBackHome}
                sx={{ mb: 4 }}
              >
                Back to Home
              </Button>
            </>
          )}

          {!challenge && !loading && !challengeComplete && (
            <Button
              variant="contained"
              color="secondary"
              size="large"
              onClick={fetchChallenge}
              sx={{ mb: 4 }}
            >
              Start {mode === 'challenge' ? 'Challenge' : 'Practice'}
            </Button>
          )}

          {loading && <CircularProgress sx={{ my: 4 }} />}

          {challenge && !challengeComplete && (
            <Card sx={{ width: '100%', maxWidth: 500, mt: 2 }} elevation={3}>
              <CardContent sx={{ p: 4 }}>
                <Box sx={{ textAlign: 'center', mb: 4 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Français
                  </Typography>
                  <Typography variant="h4" component="div" sx={{ fontWeight: 600, color: 'secondary.main' }}>
                    {challenge.francais}
                  </Typography>
                </Box>
                
                <TextField
                  fullWidth
                  label="Your Portuguese answer"
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

                {showAnswer && (
                  <Box sx={{ mt: 3, mb: 3 }}>
                    <Divider sx={{ mb: 2 }} />
                    <Typography variant="subtitle1" color="text.secondary" gutterBottom sx={{ fontWeight: 600 }}>
                      Présent de l'indicatif
                    </Typography>
                    <List dense>
                      {challenge.present.map((conjugation, index) => (
                        <ListItem key={index}>
                          <ListItemText
                            primary={conjugation}
                            primaryTypographyProps={{ variant: 'body1', fontWeight: 'medium' }}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                )}

                {!showAnswer ? (
                  <Button
                    variant="contained"
                    color="secondary"
                    fullWidth
                    size="large"
                    onClick={checkAnswer}
                    disabled={!userAnswer.trim()}
                  >
                    Check Answer
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    color="secondary"
                    fullWidth
                    size="large"
                    onClick={fetchChallenge}
                  >
                    Next Challenge
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

export default VerbChallengePage;
