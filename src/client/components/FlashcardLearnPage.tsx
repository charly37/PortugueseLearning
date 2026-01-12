import React, { useState, useEffect } from 'react';
import { Container, Box, Typography, Button, Card, CardContent, IconButton, CircularProgress, Divider } from '@mui/material';
import { useTranslation } from 'react-i18next';
import FlipCameraAndroidIcon from '@mui/icons-material/FlipCameraAndroid';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import InfoIcon from '@mui/icons-material/Info';
import './FlashcardLearnPage.css';

interface Challenge {
  id: string;
  port: string;
  fr: { translation: string; note: string };
  en: { translation: string; note: string };
  present?: string[]; // For verbs
}

interface User {
  id: string;
  username: string;
  email?: string;
  isGuest?: boolean;
  preferredLanguage?: 'fr' | 'en';
}

interface FlashcardLearnPageProps {
  challengeType: 'word' | 'verb' | 'idiom';
  onBackHome: () => void;
  user: User | null;
  onNavigateToLogin: () => void;
  onNavigateToRegister: () => void;
  onCreateGuest?: () => Promise<User | null>;
}

const FlashcardLearnPage: React.FC<FlashcardLearnPageProps> = ({ 
  challengeType, 
  onBackHome,
  user,
  onNavigateToLogin,
  onNavigateToRegister,
  onCreateGuest
}) => {
  const { t } = useTranslation();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [weaknessCount, setWeaknessCount] = useState(0);
  const [randomCount, setRandomCount] = useState(0);
  const [learningStarted, setLearningStarted] = useState(false);
  const [totalCards, setTotalCards] = useState<number>(50);
  const [difficulty, setDifficulty] = useState<number>(5);
  
  const preferredLanguage = user?.preferredLanguage || 
    (localStorage.getItem('preferredLanguage') as 'fr' | 'en') || 'fr';

  const loadChallenges = async () => {
    setLoading(true);
    try {
      const weaknessWeight = difficulty / 10;
      const response = await fetch('/api/challenge/generate-learn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          challengeType,
          totalCards,
          weaknessWeight
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to load challenges');
      }
      
      const data = await response.json();
      setChallenges(data.challenges);
      setWeaknessCount(data.metadata.weaknessChallenges);
      setRandomCount(data.metadata.randomChallenges);
      setLearningStarted(true);
    } catch (error) {
      console.error('Error loading challenges:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleNext = () => {
    if (currentIndex < challenges.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsFlipped(false);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsFlipped(false);
    }
  };

  const handleStartAsGuest = async () => {
    if (onCreateGuest) {
      setLoading(true);
      const guestUser = await onCreateGuest();
      setLoading(false);
      if (!guestUser) {
        console.error('Failed to create guest account');
      }
      // The component will re-render with user set, showing configuration screen
    }
  };

  const getTitle = () => {
    switch (challengeType) {
      case 'word':
        return t('challenge.word.header');
      case 'verb':
        return t('challenge.verb.header');
      case 'idiom':
        return t('challenge.idiom.header');
      default:
        return 'Learn';
    }
  };

  const getColor = () => {
    switch (challengeType) {
      case 'word':
        return 'primary.main';
      case 'verb':
        return 'secondary.main';
      case 'idiom':
        return '#ff9800';
      default:
        return 'primary.main';
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pt: 10, pb: 4 }}>
        <Container maxWidth="md">
          <Box sx={{ mb: 4, textAlign: 'center' }}>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 600, mb: 2 }}>
              {getTitle()}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {t('challenge.word.instruction', { language: preferredLanguage === 'fr' ? 'Français' : 'English' })}
            </Typography>
          </Box>

          <Card sx={{ maxWidth: 500, mx: 'auto', mb: 3 }} elevation={3}>
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
                color="primary"
                size="large"
                onClick={handleStartAsGuest}
                fullWidth
                sx={{ mb: 2 }}
                disabled={loading}
              >
                {t('auth.startAsGuest')}
              </Button>
              <Divider sx={{ my: 2 }}>{t('common.or')}</Divider>
              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <Button
                  variant="outlined"
                  color="primary"
                  size="medium"
                  onClick={onNavigateToRegister}
                  fullWidth
                >
                  {t('auth.signUp')}
                </Button>
                <Button
                  variant="outlined"
                  color="primary"
                  size="medium"
                  onClick={onNavigateToLogin}
                  fullWidth
                >
                  {t('common.login')}
                </Button>
              </Box>
            </CardContent>
          </Card>

          <Box sx={{ textAlign: 'center' }}>
            <Button variant="text" onClick={onBackHome}>
              {t('common.back')}
            </Button>
          </Box>
        </Container>
      </Box>
    );
  }

  if (!learningStarted && user) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pt: 10, pb: 4 }}>
        <Container maxWidth="md">
          <Box sx={{ mb: 4, textAlign: 'center' }}>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 600, mb: 2 }}>
              {getTitle()}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {t('challenge.word.instruction', { language: preferredLanguage === 'fr' ? 'Français' : 'English' })}
            </Typography>
          </Box>

          <Card sx={{ maxWidth: 500, mx: 'auto', mb: 3 }} elevation={3}>
            <CardContent sx={{ p: 4 }}>
              <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3, textAlign: 'center' }}>
                {t('common.configureChallenge')}
              </Typography>
              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" gutterBottom>
                  Number of flashcards: {totalCards}
                </Typography>
                <input
                  type="range"
                  value={totalCards}
                  onChange={(e) => setTotalCards(parseInt(e.target.value))}
                  min={10}
                  max={100}
                  step={10}
                  style={{ width: '100%' }}
                />
                <Typography variant="caption" color="text.secondary">
                  Choose between 10 and 100 cards
                </Typography>
              </Box>
              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" gutterBottom>
                  {t('common.difficulty')}: {difficulty}/10 ({difficulty === 0 ? 'All random' : difficulty === 10 ? 'All weak areas' : `${difficulty * 10}% weak areas`})
                </Typography>
                <input
                  type="range"
                  value={difficulty}
                  onChange={(e) => setDifficulty(parseInt(e.target.value))}
                  min={0}
                  max={10}
                  step={1}
                  style={{ width: '100%' }}
                />
                <Typography variant="caption" color="text.secondary">
                  0 = random cards, 10 = focus on your weak areas
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button
                  variant="outlined"
                  color="primary"
                  size="large"
                  onClick={onBackHome}
                  fullWidth
                >
                  {t('common.back')}
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  onClick={loadChallenges}
                  fullWidth
                  disabled={loading}
                >
                  Start Learning
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Container>
      </Box>
    );
  }

  if (challenges.length === 0) {
    return (
      <Container maxWidth="md" sx={{ py: 8 }}>
        <Typography variant="h4" gutterBottom>No challenges available</Typography>
        <Button variant="contained" onClick={onBackHome}>
          {t('common.back')}
        </Button>
      </Container>
    );
  }

  const currentChallenge = challenges[currentIndex];
  const sourceText = currentChallenge[preferredLanguage].translation;
  const targetText = currentChallenge.port;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pt: 10, pb: 4 }}>
      <Container maxWidth="md">
        <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button variant="outlined" onClick={onBackHome}>
            {t('common.back')}
          </Button>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
            {getTitle()}
          </Typography>
          <Box sx={{ width: '120px' }} />
        </Box>

        <Box sx={{ mb: 2, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Card {currentIndex + 1} of {challenges.length}
          </Typography>
          {weaknessCount > 0 && (
            <Typography variant="caption" color="primary" sx={{ display: 'block', mt: 0.5 }}>
              📚 Studying {weaknessCount} weak area{weaknessCount !== 1 ? 's' : ''} + {randomCount} new card{randomCount !== 1 ? 's' : ''}
            </Typography>
          )}
        </Box>

        <Box
          sx={{
            mb: 4,
            cursor: 'pointer'
          }}
          onClick={handleFlip}
        >
          <Card
            elevation={4}
            sx={{
              minHeight: '400px',
              display: 'flex',
              transition: 'all 0.3s ease',
              bgcolor: isFlipped ? '#f5f5f5' : 'white',
            }}
          >
            {!isFlipped ? (
              <CardContent
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  p: 4,
                  width: '100%',
                }}
              >
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  {preferredLanguage === 'fr' ? 'Français' : 'English'}
                </Typography>
                <Typography 
                  variant="h3" 
                  component="div" 
                  sx={{ 
                    fontWeight: 600, 
                    color: getColor(),
                    textAlign: 'center',
                    mb: 4
                  }}
                >
                  {sourceText}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary' }}>
                  <FlipCameraAndroidIcon sx={{ mr: 1 }} />
                  <Typography variant="body2">
                    Click to reveal Portuguese
                  </Typography>
                </Box>
              </CardContent>
            ) : (
              <CardContent
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  p: 4,
                  width: '100%',
                }}
              >
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Português
                </Typography>
                <Typography 
                  variant="h3" 
                  component="div" 
                  sx={{ 
                    fontWeight: 600, 
                    color: getColor(),
                    textAlign: 'center',
                    mb: 2
                  }}
                >
                  {targetText}
                </Typography>
                
                {currentChallenge.fr.note && currentChallenge.fr.note !== "todo" && (
                  <Box sx={{ mt: 2, mb: 2, p: 2, bgcolor: 'info.lighter', borderRadius: 1, border: '1px solid', borderColor: 'info.light', width: '100%', maxWidth: '500px' }}>
                    <Typography variant="subtitle2" color="info.dark" gutterBottom sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <InfoIcon fontSize="small" />
                      Note
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {currentChallenge.fr.note}
                    </Typography>
                  </Box>
                )}

                {currentChallenge.present && (
                  <Box sx={{ mt: 3, textAlign: 'center' }}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Present Tense Conjugation:
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 1 }}>
                      {currentChallenge.present.join(' • ')}
                    </Typography>
                  </Box>
                )}
                <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary', mt: 4 }}>
                  <FlipCameraAndroidIcon sx={{ mr: 1 }} />
                  <Typography variant="body2">
                    Click to flip back
                  </Typography>
                </Box>
              </CardContent>
            )}
          </Card>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<NavigateBeforeIcon />}
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            sx={{ flex: 1 }}
          >
            Previous
          </Button>
          
          <IconButton
            onClick={handleFlip}
            sx={{
              bgcolor: getColor(),
              color: 'white',
              '&:hover': {
                bgcolor: getColor(),
                filter: 'brightness(0.9)',
              },
            }}
          >
            <FlipCameraAndroidIcon />
          </IconButton>

          <Button
            variant="outlined"
            endIcon={<NavigateNextIcon />}
            onClick={handleNext}
            disabled={currentIndex === challenges.length - 1}
            sx={{ flex: 1 }}
          >
            Next
          </Button>
        </Box>

        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            Use arrow keys or click the card to flip
          </Typography>
        </Box>
      </Container>
    </Box>
  );
};

export default FlashcardLearnPage;
