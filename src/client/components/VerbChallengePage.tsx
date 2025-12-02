import React, { useState } from 'react';
import { Container, Box, Typography, Button, Card, CardContent, CircularProgress, List, ListItem, ListItemText } from '@mui/material';

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

  const fetchChallenge = async () => {
    setLoading(true);
    setError(null);
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
          Learn Portuguese verb conjugations
        </Typography>

        {challenge && (
          <Card sx={{ minWidth: 350, mt: 2 }}>
            <CardContent>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                Portuguese
              </Typography>
              <Typography variant="h4" component="div" gutterBottom>
                {challenge.port}
              </Typography>
              
              <Typography variant="h6" color="text.secondary" gutterBottom sx={{ mt: 2 }}>
                Français
              </Typography>
              <Typography variant="h5" component="div" gutterBottom>
                {challenge.francais}
              </Typography>
              
              <Typography variant="h6" color="text.secondary" gutterBottom sx={{ mt: 3 }}>
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
            </CardContent>
          </Card>
        )}

        {error && (
          <Typography color="error" variant="body1">
            {error}
          </Typography>
        )}

        <Button 
          variant="contained" 
          color="secondary" 
          size="large"
          onClick={fetchChallenge}
          disabled={loading}
        >
          {loading ? <CircularProgress size={24} /> : 'Get New Verb'}
        </Button>
      </Box>
    </Container>
  );
};

export default VerbChallengePage;
