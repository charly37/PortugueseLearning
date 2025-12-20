import React from 'react';
import { Container, Box, Typography, Button, Grid, Paper } from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import TranslateIcon from '@mui/icons-material/Translate';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';

interface User {
  id: string;
  username: string;
  email: string;
}

interface LandingPageProps {
  user: User | null;
  onStartLearning: () => void;
  onVerbChallenge: () => void;
  onIdiomChallenge: () => void;
  onViewProfile: () => void;
  onLogout: () => void;
  onViewWordStats: () => void;
  onViewVerbStats: () => void;
  onViewIdiomStats: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ 
  user, 
  onStartLearning, 
  onVerbChallenge, 
  onIdiomChallenge,
  onViewWordStats,
  onViewVerbStats,
  onViewIdiomStats,
}) => {
  return (
    <Box sx={{ pt: 10, pb: 6, bgcolor: 'background.default', minHeight: '100vh' }}>
      <Container maxWidth="lg">
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            py: 6,
          }}
        >
          <Typography variant="h2" component="h1" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
            Welcome{user ? `, ${user.username}` : ''}! 👋
          </Typography>
          
          <Typography variant="h5" color="text.secondary" gutterBottom sx={{ maxWidth: '700px', mb: 2 }}>
            Master Portuguese with Interactive Challenges
          </Typography>
          
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: '800px', mb: 6 }}>
            Practice vocabulary, verb conjugations, and idioms through interactive exercises. 
            Learn Portuguese efficiently with our comprehensive learning platform.
          </Typography>
          
          <Grid container spacing={3} sx={{ maxWidth: '900px' }}>
            <Grid item xs={12} md={4}>
              <Paper
                elevation={2}
                sx={{
                  p: 4,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                  },
                }}
              >
                <TranslateIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
                  Word Challenge
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3, flexGrow: 1 }}>
                  Build your vocabulary by translating words from French to Portuguese
                </Typography>
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  onClick={onStartLearning}
                  fullWidth
                  sx={{ mb: user ? 1 : 0 }}
                >
                  Start Learning
                </Button>
                {user && (
                  <Button
                    variant="outlined"
                    color="primary"
                    size="medium"
                    onClick={onViewWordStats}
                    fullWidth
                  >
                    My Stats
                  </Button>
                )}
              </Paper>
            </Grid>

            <Grid item xs={12} md={4}>
              <Paper
                elevation={2}
                sx={{
                  p: 4,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                  },
                }}
              >
                <SchoolIcon sx={{ fontSize: 48, color: 'secondary.main', mb: 2 }} />
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
                  Verb Challenge
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3, flexGrow: 1 }}>
                  Master verb conjugations in the present tense
                </Typography>
                <Button
                  variant="contained"
                  color="secondary"
                  size="large"
                  onClick={onVerbChallenge}
                  fullWidth
                  sx={{ mb: user ? 1 : 0 }}
                >
                  Practice Verbs
                </Button>
                {user && (
                  <Button
                    variant="outlined"
                    color="secondary"
                    size="medium"
                    onClick={onViewVerbStats}
                    fullWidth
                  >
                    My Stats
                  </Button>
                )}
              </Paper>
            </Grid>

            <Grid item xs={12} md={4}>
              <Paper
                elevation={2}
                sx={{
                  p: 4,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                  },
                }}
              >
                <RecordVoiceOverIcon sx={{ fontSize: 48, color: '#ff9800', mb: 2 }} />
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
                  Idiom Challenge
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3, flexGrow: 1 }}>
                  Learn common Portuguese idioms and expressions
                </Typography>
                <Button
                  variant="contained"
                  size="large"
                  onClick={onIdiomChallenge}
                  fullWidth
                  sx={{
                    mb: user ? 1 : 0,
                    bgcolor: '#ff9800',
                    '&:hover': {
                      bgcolor: '#f57c00',
                    },
                  }}
                >
                  Learn Idioms
                </Button>
                {user && (
                  <Button
                    variant="outlined"
                    size="medium"
                    onClick={onViewIdiomStats}
                    fullWidth
                    sx={{
                      color: '#ff9800',
                      borderColor: '#ff9800',
                      '&:hover': {
                        borderColor: '#f57c00',
                        bgcolor: '#ff980010',
                      },
                    }}
                  >
                    My Stats
                  </Button>
                )}
              </Paper>
            </Grid>
          </Grid>
        </Box>
      </Container>
    </Box>
  );
};

export default LandingPage;
