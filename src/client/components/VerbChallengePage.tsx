import React, { useState } from 'react';
import { Container, Box, Typography, Button, Card, CardContent, CircularProgress, TextField, Alert, List, ListItem, ListItemText } from '@mui/material';

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
    <Container maxWidth="md">
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: 3,
          position: 'relative',
        }}
      >
        <Button
          onClick={onBackHome}
          sx={{ position: 'absolute', top: 20, left: 20 }}
        >
          ← Back to Home
        </Button>

        <Typography variant="h3" component="h1" gutterBottom>
          Portuguese Verb Challenge
        </Typography>
        
        <Typography variant="h6" color="text.secondary" gutterBottom>
          Translate verbs from French to Portuguese
        </Typography>

        {challenge && (
          <Card sx={{ minWidth: 400, mt: 2 }}>
            <CardContent>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                Français
              </Typography>
              <Typography variant="h4" component="div" gutterBottom sx={{ mb: 3 }}>
                {challenge.francais}
              </Typography>
              
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
                <Box sx={{ mt: 2, mb: 2 }}>
                  <Typography variant="h6" color="text.secondary" gutterBottom>
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
                  onClick={fetchChallenge}
                >
                  Next Challenge
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {error && (
          <Typography color="error" variant="body1">
            {error}
          </Typography>
        )}

        {!challenge && (
          <Button 
            variant="contained" 
            color="secondary" 
            size="large"
            onClick={fetchChallenge}
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : 'Start Challenge'}
          </Button>
        )}
      </Box>
    </Container>
  );
};

export default VerbChallengePage;
