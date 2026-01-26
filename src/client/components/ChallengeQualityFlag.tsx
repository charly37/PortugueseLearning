import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Tooltip } from '@mui/material';
import FlagIcon from '@mui/icons-material/Flag';
import CheckIcon from '@mui/icons-material/Check';
import { useTranslation } from 'react-i18next';

interface ChallengeQualityFlagProps {
  challengeId: string;
  isGuest?: boolean;
  onFlagSubmit?: () => void;
}

const ChallengeQualityFlag: React.FC<ChallengeQualityFlagProps> = ({ 
  challengeId, 
  isGuest = false,
  onFlagSubmit
}) => {
  const { t } = useTranslation();
  const [isFlagged, setIsFlagged] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch user's existing flag for this challenge
  useEffect(() => {
    if (isGuest) return;
    
    const fetchUserFlag = async () => {
      try {
        const response = await fetch('/api/challenge/get-quality-flags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ challengeIds: [challengeId] })
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.flags[challengeId]) {
            setIsFlagged(true);
          }
        }
      } catch (error) {
        console.error('Error fetching user flag:', error);
      }
    };

    fetchUserFlag();
  }, [challengeId, isGuest]);

  const handleFlag = async () => {
    if (isGuest || isSubmitting || isFlagged) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/challenge/flag-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ challengeId })
      });

      if (response.ok) {
        setIsFlagged(true);
        if (onFlagSubmit) {
          onFlagSubmit();
        }
      }
    } catch (error) {
      console.error('Error submitting flag:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isGuest) {
    return null;
  }

  return (
    <Box 
      sx={{ 
        mt: 2, 
        p: 2, 
        bgcolor: 'grey.50', 
        borderRadius: 2,
        border: '1px dashed',
        borderColor: isFlagged ? 'warning.main' : 'grey.300'
      }}
    >
      <Typography variant="caption" color="text.secondary" gutterBottom display="block" sx={{ mb: 1 }}>
        {t('challenge.qualityFlag.description', { 
          defaultValue: 'Report quality issues (missing translations, errors, etc.)'
        })}
      </Typography>
      
      <Tooltip title={isFlagged ? t('challenge.qualityFlag.flagged', { defaultValue: 'Already flagged for review' }) : t('challenge.qualityFlag.flag', { defaultValue: 'Flag this challenge for review' })}>
        <span>
          <Button
            onClick={handleFlag}
            disabled={isSubmitting || isFlagged}
            variant={isFlagged ? "outlined" : "contained"}
            size="small"
            startIcon={isFlagged ? <CheckIcon /> : <FlagIcon />}
            sx={{
              textTransform: 'none',
              borderRadius: 2,
              bgcolor: isFlagged ? 'transparent' : 'warning.main',
              color: isFlagged ? 'warning.main' : 'white',
              borderColor: isFlagged ? 'warning.main' : 'transparent',
              '&:hover': {
                bgcolor: isFlagged ? 'warning.lighter' : 'warning.dark'
              },
              '&.Mui-disabled': {
                bgcolor: isFlagged ? 'transparent' : 'grey.300',
                color: isFlagged ? 'warning.main' : 'grey.500',
                borderColor: isFlagged ? 'warning.main' : 'transparent'
              }
            }}
          >
            {isFlagged 
              ? t('challenge.qualityFlag.flaggedButton', { defaultValue: 'Flagged for Review' })
              : t('challenge.qualityFlag.flagButton', { defaultValue: 'Flag for Review' })
            }
          </Button>
        </span>
      </Tooltip>
    </Box>
  );
};

export default ChallengeQualityFlag;
