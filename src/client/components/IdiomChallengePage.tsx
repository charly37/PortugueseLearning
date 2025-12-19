import React, { useState } from 'react';
import { Container, Box, Typography, Button, Card, CardContent, CircularProgress, TextField, Alert, Chip } from '@mui/material';

interface IdiomChallenge {
  port: string;
  francais: string;
}

interface IdiomChallengePageProps {
  onBackHome: () => void;
}

const IdiomChallengePage: React.FC<IdiomChallengePageProps> = ({ onBackHome }) => {
  const [challenge, setChallenge] = useState<IdiomChallenge | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  const fetchChallenge = async () => {
    setLoading(true);
    setError(null);
    setUserAnswer('');
    setFeedback(null);
    setShowAnswer(false);
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
  };

  const checkAnswer = () => {
    if (!challenge || !userAnswer.trim()) return;

    const normalizedAnswer = userAnswer.trim().toLowerCase();
    const normalizedCorrect = challenge.port.toLowerCase();

    if (normalizedAnswer === normalizedCorrect) {
      setFeedback({ type: 'success', message: 'Correct! Well done! 🎉' });
      setShowAnswer(true);
    } else {
      setFeedback({ type: 'error', message: `Incorrect. The correct answer is: ${challenge.port}` });
      setShowAnswer(true);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !showAnswer) {
      checkAnswer();
    }
  };

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
          <Chip label="Idiom Challenge" sx={{ mb: 2, bgcolor: '#ff9800', color: 'white' }} />
          
          <Typography variant="h3" component="h1" gutterBottom align="center">
            Portuguese Idioms
          </Typography>
          
          <Typography variant="body1" color="text.secondary" gutterBottom sx={{ mb: 4 }}>
            Translate idioms from French to Portuguese
          </Typography>

          {!challenge && !loading && (
            <Button
              variant="contained"
              size="large"
              onClick={fetchChallenge}
              sx={{
                mb: 4,
                bgcolor: '#ff9800',
                '&:hover': {
                  bgcolor: '#f57c00',
                },
              }}
            >
              Start Challenge
            </Button>
          )}

          {loading && <CircularProgress sx={{ my: 4 }} />}

          {challenge && (
            <Card sx={{ width: '100%', maxWidth: 500, mt: 2 }} elevation={3}>
              <CardContent sx={{ p: 4 }}>
                <Box sx={{ textAlign: 'center', mb: 4 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Français
                  </Typography>
                  <Typography variant="h5" component="div" sx={{ fontWeight: 600, color: '#ff9800' }}>
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
                  autoFocus
                  sx={{ mb: 2 }}
                />

                {feedback && (
                  <Alert severity={feedback.type} sx={{ mb: 2 }}>
                    {feedback.message}
                  </Alert>
                )}

                {!showAnswer ? (
                  <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    onClick={checkAnswer}
                    disabled={!userAnswer.trim()}
                    sx={{
                      bgcolor: '#ff9800',
                      '&:hover': {
                        bgcolor: '#f57c00',
                      },
                    }}
                  >
                    Check Answer
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    onClick={fetchChallenge}
                    sx={{
                      bgcolor: '#ff9800',
                      '&:hover': {
                        bgcolor: '#f57c00',
                      },
                    }}
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

export default IdiomChallengePage;
