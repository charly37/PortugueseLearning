import React, { useState, useEffect } from 'react';
import { Container, Box, Typography, Button, Card, CardContent, IconButton, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';
import FlipCameraAndroidIcon from '@mui/icons-material/FlipCameraAndroid';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import ShuffleIcon from '@mui/icons-material/Shuffle';
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
  email: string;
  preferredLanguage?: 'fr' | 'en';
}

interface FlashcardLearnPageProps {
  challengeType: 'word' | 'verb' | 'idiom';
  onBackHome: () => void;
  user: User | null;
}

const FlashcardLearnPage: React.FC<FlashcardLearnPageProps> = ({ 
  challengeType, 
  onBackHome,
  user 
}) => {
  const { t } = useTranslation();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const preferredLanguage = user?.preferredLanguage || 
    (localStorage.getItem('preferredLanguage') as 'fr' | 'en') || 'fr';

  // Load all challenges of the specified type
  useEffect(() => {
    const loadChallenges = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/${challengeType}-challenges-all`);
        const data = await response.json();
        setChallenges(data);
      } catch (error) {
        console.error('Error loading challenges:', error);
      } finally {
        setLoading(false);
      }
    };

    loadChallenges();
  }, [challengeType]);

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

  const handleShuffle = () => {
    const shuffled = [...challenges].sort(() => Math.random() - 0.5);
    setChallenges(shuffled);
    setCurrentIndex(0);
    setIsFlipped(false);
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
          <Button
            variant="outlined"
            startIcon={<ShuffleIcon />}
            onClick={handleShuffle}
          >
            Shuffle
          </Button>
        </Box>

        <Box sx={{ mb: 2, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Card {currentIndex + 1} of {challenges.length}
          </Typography>
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
