import React, { useState } from 'react';
import { Container, Box, Typography, Button, Card, CardContent, CircularProgress, TextField, Alert, List, ListItem, ListItemText, Chip, Divider } from '@mui/material';

interface VerbChallenge {
  port: string;
  francais: string;
  present: string[];
}

interface VerbChallengePageProps {
  onBackHome: () => void;
}

const VerbChallengePage: React.FC<VerbChallengePageProps> = ({ onBackHome }) => {
  const [challenge, setChallenge] = useState<VerbChallenge | null>(null);
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
          <Chip label="Verb Challenge" color="secondary" sx={{ mb: 2 }} />
          
          <Typography variant="h3" component="h1" gutterBottom align="center">
            Portuguese Verbs
          </Typography>
          
          <Typography variant="body1" color="text.secondary" gutterBottom sx={{ mb: 4 }}>
            Translate verbs from French to Portuguese
          </Typography>

          {!challenge && !loading && (
            <Button
              variant="contained"
              color="secondary"
              size="large"
              onClick={fetchChallenge}
              sx={{ mb: 4 }}
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
                  autoFocus
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
