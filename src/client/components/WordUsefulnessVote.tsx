import React, { useState, useEffect } from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import ThumbsUpDownIcon from '@mui/icons-material/ThumbsUpDown';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import { useTranslation } from 'react-i18next';

interface WordUsefulnessVoteProps {
  challengeId: string;
  currentUsefulness?: number;
  isGuest?: boolean;
  onVoteSubmit?: (usefulness: number) => void;
}

const WordUsefulnessVote: React.FC<WordUsefulnessVoteProps> = ({ 
  challengeId, 
  currentUsefulness = 2,
  isGuest = false,
  onVoteSubmit
}) => {
  const { t } = useTranslation();
  const [userVote, setUserVote] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch user's existing vote for this challenge
  useEffect(() => {
    if (isGuest) return;
    
    const fetchUserVote = async () => {
      try {
        const response = await fetch('/api/challenge/get-votes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ challengeIds: [challengeId] })
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.votes[challengeId]) {
            setUserVote(data.votes[challengeId]);
          }
        }
      } catch (error) {
        console.error('Error fetching user vote:', error);
      }
    };

    fetchUserVote();
  }, [challengeId, isGuest]);

  const handleVote = async (usefulness: number) => {
    if (isGuest || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/challenge/vote-usefulness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ challengeId, usefulness })
      });

      if (response.ok) {
        setUserVote(usefulness);
        if (onVoteSubmit) {
          onVoteSubmit(usefulness);
        }
      }
    } catch (error) {
      console.error('Error submitting vote:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isGuest) {
    return null;
  }

  const displayUsefulness = userVote ?? currentUsefulness;

  return (
    <Box 
      sx={{ 
        mt: 2, 
        p: 2, 
        bgcolor: 'grey.50', 
        borderRadius: 2,
        border: '1px dashed',
        borderColor: 'grey.300'
      }}
    >
      <Typography variant="caption" color="text.secondary" gutterBottom display="block" sx={{ mb: 1, fontStyle: 'italic' }}>
        ℹ️ {t('challenge.voteUsefulness.description', { 
          defaultValue: 'Optional: Help improve the learning experience by rating this word\'s usefulness (completely optional, you can skip this)'
        })}
      </Typography>
      
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <Tooltip title={t('challenge.voteUsefulness.notUseful', { defaultValue: 'Not very useful' })}>
          <IconButton
            onClick={() => handleVote(1)}
            disabled={isSubmitting}
            sx={{
              color: displayUsefulness === 1 ? 'error.main' : 'grey.400',
              bgcolor: displayUsefulness === 1 ? 'error.lighter' : 'transparent',
              '&:hover': {
                bgcolor: displayUsefulness === 1 ? 'error.light' : 'grey.100'
              }
            }}
          >
            <ThumbDownIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title={t('challenge.voteUsefulness.neutral', { defaultValue: 'Moderately useful' })}>
          <IconButton
            onClick={() => handleVote(2)}
            disabled={isSubmitting}
            sx={{
              color: displayUsefulness === 2 ? 'warning.main' : 'grey.400',
              bgcolor: displayUsefulness === 2 ? 'warning.lighter' : 'transparent',
              '&:hover': {
                bgcolor: displayUsefulness === 2 ? 'warning.light' : 'grey.100'
              }
            }}
          >
            <ThumbsUpDownIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title={t('challenge.voteUsefulness.useful', { defaultValue: 'Very useful' })}>
          <IconButton
            onClick={() => handleVote(3)}
            disabled={isSubmitting}
            sx={{
              color: displayUsefulness === 3 ? 'success.main' : 'grey.400',
              bgcolor: displayUsefulness === 3 ? 'success.lighter' : 'transparent',
              '&:hover': {
                bgcolor: displayUsefulness === 3 ? 'success.light' : 'grey.100'
              }
            }}
          >
            <ThumbUpIcon />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};

export default WordUsefulnessVote;
