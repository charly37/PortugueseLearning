import React from 'react';
import { Container, Box, Typography, Button, Grid } from '@mui/material';

interface LandingPageProps {
  onStartLearning: () => void;
  onVerbChallenge: () => void;
  onIdiomChallenge: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStartLearning, onVerbChallenge, onIdiomChallenge }) => {
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
          textAlign: 'center',
        }}
      >
        
        <Typography variant="h2" component="h1" gutterBottom>
          Welcome to Portuguese Learning
        </Typography>
        
        <Typography variant="h5" color="text.secondary" gutterBottom sx={{ maxWidth: '600px' }}>
          Master Portuguese vocabulary with our interactive learning platform
        </Typography>
        
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: '700px', mt: 2 }}>
          This website is designed to help you learn Portuguese through vocabulary, verb, and idiom challenges. 
          Practice translating words between Portuguese and French, learn verb conjugations, master common idioms, 
          and improve your language skills one word at a time.
        </Typography>
        
        <Grid container spacing={2} sx={{ mt: 3, maxWidth: '600px' }}>
          <Grid item xs={12} sm={4}>
            <Button 
              variant="contained" 
              color="primary" 
              size="large"
              onClick={onStartLearning}
              fullWidth
              sx={{ py: 1.5 }}
            >
              Word Challenge
            </Button>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Button 
              variant="contained" 
              color="secondary" 
              size="large"
              onClick={onVerbChallenge}
              fullWidth
              sx={{ py: 1.5 }}
            >
              Verb Challenge
            </Button>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Button 
              variant="contained" 
              sx={{ 
                py: 1.5,
                backgroundColor: '#ff9800',
                '&:hover': {
                  backgroundColor: '#f57c00',
                }
              }}
              size="large"
              onClick={onIdiomChallenge}
              fullWidth
            >
              Idiom Challenge
            </Button>
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
};

export default LandingPage;
