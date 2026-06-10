import React, { useState, useEffect, useRef } from 'react';
import { Container, Box, Typography, Button, Card, CardContent, CircularProgress, TextField, Alert, Chip, List, ListItem, ListItemText, Divider, Slider, Switch, FormControlLabel, FormControl, InputLabel, Select, MenuItem, FormHelperText, IconButton } from '@mui/material';
import { useTranslation } from 'react-i18next';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import TimerIcon from '@mui/icons-material/Timer';
import InfoIcon from '@mui/icons-material/Info';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import { submitChallengeAttempt, normalizeString } from '../utils/challengeUtils';
import WordUsefulnessVote from './WordUsefulnessVote';
import ChallengeQualityFlag from './ChallengeQualityFlag';

interface Challenge {
  id: string;
  port: string;
  fr: { translation: string; note: string; use_exemple?: string; port_exemple?: string };
  en: { translation: string; note: string; use_exemple?: string; port_exemple?: string };
  source?: 'weakness' | 'random';
  user_usefulness?: number;
  options?: string[];  // For multiple-choice mode
  distractors?: string[];  // Wrong answers
}

interface AttemptDetail {
  challengeId: string;
  userAnswer: string;
  correctAnswer: string;
  correct: boolean;
  timeSpent: number;
}

interface User {
  id: string;
  username: string;
  email?: string;
  isGuest?: boolean;
  preferredLanguage?: 'fr' | 'en';
  mobileFriendly?: boolean;
  practiceMode?: boolean;
}

interface ChallengePageProps {
  mode: 'practice' | 'challenge';
  onBackHome: () => void;
  user: User | null;
  onNavigateToLogin: () => void;
  onNavigateToRegister: () => void;
  onCreateGuest?: () => Promise<User | null>;
  /** If provided, skip the config screen and start directly with these challenges */
  preloadedChallenges?: Challenge[];
  /** Optional callback fired after each answer (e.g. to also track progress in a weekly doc) */
  onAnswerChecked?: (challengeId: string, correct: boolean) => void;
}

const ChallengePage: React.FC<ChallengePageProps> = ({ mode, onBackHome, user, onNavigateToLogin, onNavigateToRegister, onCreateGuest, preloadedChallenges, onAnswerChecked }) => {
  const { t } = useTranslation();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [turnCount, setTurnCount] = useState(0);
  const [challengeComplete, setChallengeComplete] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [attemptHistory, setAttemptHistory] = useState<AttemptDetail[]>([]);
  const [maxTurns, setMaxTurns] = useState<number>(20);
  const [difficulty, setDifficulty] = useState<number>(5);
  const [mobileFriendly, setMobileFriendly] = useState<boolean>(user?.mobileFriendly || false);
  const [minUsefulness, setMinUsefulness] = useState<number>(1);
  const [challengeStarted, setChallengeStarted] = useState(mode === 'practice' || (preloadedChallenges !== undefined && preloadedChallenges.length > 0));
  const [generatedChallenges, setGeneratedChallenges] = useState<Challenge[]>(preloadedChallenges ?? []);
  const [currentChallengeIndex, setCurrentChallengeIndex] = useState(0);
  const [audioAvailable, setAudioAvailable] = useState<boolean>(false);
  
  // Practice mode state
  const [practiceMode, setPracticeMode] = useState<boolean>(user?.practiceMode || false);
  const [masteredChallenges, setMasteredChallenges] = useState<Set<string>>(new Set());
  const [pendingQueue, setPendingQueue] = useState<Challenge[]>([]);
  const [flaggedInSession, setFlaggedInSession] = useState<Set<string>>(new Set());
  const [attemptCounts, setAttemptCounts] = useState<Map<string, number>>(new Map());
  
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Get user's preferred language or default to 'fr'
  const preferredLanguage = user?.preferredLanguage || 
    (localStorage.getItem('preferredLanguage') as 'fr' | 'en') || 'fr';

  // Check if audio file exists for the current word
  const checkAudioAvailability = async (challengeId: string) => {
    try {
      const audioPath = `${window.location.origin}/sounds/${challengeId}.mp3`;
      const testAudio = new Audio();
      
      const checkPromise = new Promise<boolean>((resolve) => {
        testAudio.oncanplaythrough = () => resolve(true);
        testAudio.onerror = () => resolve(false);
        testAudio.src = audioPath;
      });
      
      const result = await checkPromise;
      setAudioAvailable(result);
    } catch {
      setAudioAvailable(false);
    }
  };

  // Play audio pronunciation
  const playAudio = () => {
    if (challenge && audioAvailable) {
      const audioPath = `${window.location.origin}/sounds/${challenge.id}.mp3`;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      audioRef.current = new Audio(audioPath);
      audioRef.current.play().catch(() => {
        // Silently handle playback errors
      });
    }
  };

  // Update mobileFriendly and practiceMode when user changes (e.g., after guest creation)
  useEffect(() => {
    if (user?.mobileFriendly !== undefined) {
      setMobileFriendly(user.mobileFriendly);
    }
    if (user?.practiceMode !== undefined) {
      setPracticeMode(user.practiceMode);
    }
  }, [user?.mobileFriendly, user?.practiceMode]);

  // Check audio availability when challenge changes
  useEffect(() => {
    if (challenge && challenge.id) {
      checkAudioAvailability(challenge.id);
    } else {
      setAudioAvailable(false);
    }
  }, [challenge]);

  const generateChallengeSet = async () => {
    setLoading(true);
    setError(null);
    try {
      const weaknessWeight = difficulty / 10; // Convert 0-10 to 0-1
      const response = await fetch('/api/challenge/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          challengeType: 'word',
          totalTurns: maxTurns,
          weaknessWeight: weaknessWeight,
          mobileFriendly: mobileFriendly,
          minUsefulness: minUsefulness
        })
      });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please log in to use personalized challenges');
        }
        throw new Error('Failed to generate challenge set');
      }
      const data = await response.json();
      setGeneratedChallenges(data.challenges);
      console.log('[Challenge Generation] Generated challenges:', {
        total: data.challenges.length,
        challengeIds: data.challenges.map((c: any) => c.id),
        words: data.challenges.map((c: any) => c.port),
        uniqueIds: new Set(data.challenges.map((c: any) => c.id)).size,
        hasDuplicates: data.challenges.length !== new Set(data.challenges.map((c: any) => c.id)).size
      });
      setCurrentChallengeIndex(0);
      setChallenge(data.challenges[0]);
      setChallengeStarted(true);
      setStartTime(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleStartAsGuest = async () => {
    if (onCreateGuest) {
      setLoading(true);
      const guestUser = await onCreateGuest();
      setLoading(false);
      if (!guestUser) {
        setError('Failed to create guest account');
      }
      // Don't start the challenge yet - let the user configure it first
      // The component will re-render with user set, showing the configuration screen
    }
  };

  const fetchChallenge = async () => {
    setLoading(true);
    setError(null);
    setUserAnswer('');
    setFeedback(null);
    setShowAnswer(false);
    setStartTime(Date.now());
    
    console.log('[fetchChallenge] Starting fetch:', {
      mode,
      practiceMode,
      generatedChallengesCount: generatedChallenges.length,
      currentIndex: currentChallengeIndex,
      pendingQueueLength: pendingQueue.length,
      masteredCount: masteredChallenges.size
    });
    
    // Use generated challenges in challenge mode, fetch randomly in practice mode
    if (mode === 'challenge' && generatedChallenges.length > 0) {
      // Practice mode: check pending queue first
      if (practiceMode && pendingQueue.length > 0) {
        // Pop from end of queue (FIFO order)
        const nextChallenge = pendingQueue[0];
        setPendingQueue(pendingQueue.slice(1));
        setChallenge(nextChallenge);
        console.log('[fetchChallenge] Loaded from retry queue:', {
          challengeId: nextChallenge.id,
          word: nextChallenge.port,
          remainingInQueue: pendingQueue.length - 1
        });
        setLoading(false);
      } else {
        // Normal progression: move to next challenge in generated set
        // In practice mode, skip over already-mastered challenges
        let nextIndex = currentChallengeIndex + 1;
        
        if (practiceMode) {
          // Find the next unmastered challenge
          console.log('[fetchChallenge] Looking for next unmastered challenge starting at index:', nextIndex);
          while (nextIndex < generatedChallenges.length && (masteredChallenges.has(generatedChallenges[nextIndex].id) || flaggedInSession.has(generatedChallenges[nextIndex].id))) {
            console.log('[fetchChallenge] Skipping mastered challenge at index', nextIndex, generatedChallenges[nextIndex].port);
            nextIndex++;
          }
        }
        
        if (nextIndex < generatedChallenges.length) {
          setCurrentChallengeIndex(nextIndex);
          setChallenge(generatedChallenges[nextIndex]);
          console.log('[fetchChallenge] Loaded next challenge:', {
            index: nextIndex,
            challengeId: generatedChallenges[nextIndex].id,
            word: generatedChallenges[nextIndex].port
          });
          setLoading(false);
        } else if (practiceMode && new Set([...masteredChallenges, ...flaggedInSession]).size < generatedChallenges.length) {
          // Practice mode: Reached end of list but haven't mastered/flagged all
          // Loop back from the beginning to find unmastered, unflagged challenges
          console.log('[fetchChallenge] Reached end, looping back to find unmastered challenges');
          let loopIndex = 0;
          while (loopIndex < generatedChallenges.length && (masteredChallenges.has(generatedChallenges[loopIndex].id) || flaggedInSession.has(generatedChallenges[loopIndex].id))) {
            console.log('[fetchChallenge] Skipping mastered challenge at index', loopIndex, generatedChallenges[loopIndex].port);
            loopIndex++;
          }
          if (loopIndex < generatedChallenges.length) {
            setCurrentChallengeIndex(loopIndex);
            setChallenge(generatedChallenges[loopIndex]);
            console.log('[fetchChallenge] Loaded challenge from loop:', {
              index: loopIndex,
              challengeId: generatedChallenges[loopIndex].id,
              word: generatedChallenges[loopIndex].port
            });
            setLoading(false);
          } else {
            // All challenges are mastered
            console.log('[fetchChallenge] All challenges mastered!');
            setChallengeComplete(true);
            setLoading(false);
          }
        } else {
          // All challenges completed
          setChallengeComplete(true);
          setLoading(false);
        }
      }
    } else {
      try {
        const response = await fetch('/api/challenge');
        if (!response.ok) {
          throw new Error('Failed to fetch challenge');
        }
        const data = await response.json();
        setChallenge(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }
  };

  const checkAnswer = async () => {
    if (!challenge || !userAnswer.trim()) return;

    const normalizedAnswer = normalizeString(userAnswer);
    const normalizedCorrect = normalizeString(challenge.port);
    const isCorrect = normalizedAnswer === normalizedCorrect;
    const timeSpent = Date.now() - startTime;

    if (isCorrect) {
      const exampleText = challenge[preferredLanguage].port_exemple ? `\n"${challenge[preferredLanguage].port_exemple}"` : '';
      setFeedback({ type: 'success', message: `${t('challenge.correct')} ${challenge.port}${exampleText}` });
      setShowAnswer(true);
    } else {
      const exampleText = challenge[preferredLanguage].port_exemple ? `\n"${challenge[preferredLanguage].port_exemple}"` : '';
      setFeedback({ type: 'error', message: `${t('challenge.incorrect')} ${challenge.port}${exampleText}` });
      setShowAnswer(true);
    }

    // Play audio to help with pronunciation after validation
    if (audioAvailable) {
      // Small delay to ensure feedback is visible first
      setTimeout(() => {
        playAudio();
      }, 300);
    }

    // Submit attempt to regular stats
    await submitChallengeAttempt(
      challenge.id,
      'word',
      isCorrect,
      userAnswer.trim(),
      challenge.port,
      timeSpent
    );
    // Notify caller (e.g. weekly challenge) so it can also record in its own store
    onAnswerChecked?.(challenge.id, isCorrect);

    // Increment turn count and check if challenge mode is complete
    if (mode === 'challenge') {
      const newTurnCount = turnCount + 1;
      setTurnCount(newTurnCount);
      
      // Practice mode logic
      if (practiceMode) {
        // Track attempt count for this challenge
        const currentAttempts = attemptCounts.get(challenge.id) || 0;
        setAttemptCounts(new Map(attemptCounts.set(challenge.id, currentAttempts + 1)));
        
        console.log('[Practice Mode] Answer checked:', {
          challengeId: challenge.id,
          word: challenge.port,
          isCorrect,
          currentAttempts: currentAttempts + 1
        });
        
        let newMasteredSize = masteredChallenges.size;
        
        if (isCorrect) {
          // Mark as mastered
          const wasAlreadyMastered = masteredChallenges.has(challenge.id);
          const newMastered = new Set(masteredChallenges.add(challenge.id));
          setMasteredChallenges(newMastered);
          newMasteredSize = newMastered.size;
          // Only increment correctCount if this is a newly mastered challenge
          if (!wasAlreadyMastered) {
            setCorrectCount(correctCount + 1);
          }
          console.log('[Practice Mode] Challenge mastered!', {
            challengeId: challenge.id,
            word: challenge.port,
            wasAlreadyMastered,
            masteredCount: newMastered.size,
            totalChallenges: generatedChallenges.length,
            masteredIds: Array.from(newMastered),
            allChallengeIds: generatedChallenges.map(c => c.id)
          });
        } else if (!flaggedInSession.has(challenge.id)) {
          // Add back to queue for retry (skip if already flagged as bad quality)
          const newQueue = [...pendingQueue, challenge];
          setPendingQueue(newQueue);
          setIncorrectCount(incorrectCount + 1);
          console.log('[Practice Mode] Challenge added to retry queue', {
            challengeId: challenge.id,
            queueLength: newQueue.length
          });
        } else {
          setIncorrectCount(incorrectCount + 1);
        }
        
        // Check completion: all challenges mastered or flagged
        console.log('[Practice Mode] Completion check:', {
          masteredCount: newMasteredSize,
          totalChallenges: generatedChallenges.length,
          complete: newMasteredSize + flaggedInSession.size >= generatedChallenges.length
        });
        if (newMasteredSize + flaggedInSession.size >= generatedChallenges.length) {
          setChallengeComplete(true);
        }
      } else {
        // Normal mode: just count
        if (isCorrect) {
          setCorrectCount(correctCount + 1);
        } else {
          setIncorrectCount(incorrectCount + 1);
        }
        
        // Check completion: all turns completed
        if (newTurnCount >= maxTurns) {
          setChallengeComplete(true);
        }
      }
      
      // Store attempt details
      setAttemptHistory([...attemptHistory, {
        challengeId: challenge[preferredLanguage].translation,
        userAnswer: userAnswer.trim(),
        correctAnswer: challenge.port,
        correct: isCorrect,
        timeSpent: timeSpent
      }]);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !showAnswer) {
      checkAnswer();
    }
  };

  const handleChallengeFlag = (challengeId: string) => {
    // Remove the flagged challenge from the retry queue so it won't repeat
    setPendingQueue(prev => prev.filter(c => c.id !== challengeId));
    // Track as flagged so it gets skipped in forward traversal
    const newFlagged = new Set([...flaggedInSession, challengeId]);
    setFlaggedInSession(newFlagged);
    // Check if all challenges are now either mastered or flagged
    if (practiceMode) {
      const doneCount = new Set([...masteredChallenges, ...newFlagged]).size;
      if (doneCount >= generatedChallenges.length) {
        setChallengeComplete(true);
      }
    }
  };

  // Auto-start when preloaded challenges are supplied (weekly challenge mode)
  useEffect(() => {
    if (preloadedChallenges && preloadedChallenges.length > 0) {
      setGeneratedChallenges(preloadedChallenges);
      setCurrentChallengeIndex(0);
      setChallenge(preloadedChallenges[0]);
      setChallengeStarted(true);
      setMaxTurns(preloadedChallenges.length);
      setStartTime(Date.now());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus input when new challenge loads
  useEffect(() => {
    if (challenge && !showAnswer) {
      inputRef.current?.focus();
    }
  }, [challenge, showAnswer]);

  // Global keyboard listener for when answer is shown
  useEffect(() => {
    const handleGlobalKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && showAnswer && challenge) {
        fetchChallenge();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyPress);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyPress);
    };
  }, [showAnswer, challenge]);

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
          <Chip 
            label={
              mode === 'challenge' 
                ? (practiceMode 
                    ? `${masteredChallenges.size}/${generatedChallenges.length} ${t('challenge.mastered')}`
                    : t('challenge.word.title', { current: turnCount, total: maxTurns })
                  )
                : t('challenge.word.practiceTitle')
            } 
            color="primary" 
            sx={{ mb: 2 }} 
          />
          
          <Typography variant="h3" component="h1" gutterBottom align="center">
            {t('challenge.word.header')}
          </Typography>
          
          <Typography variant="body1" color="text.secondary" gutterBottom sx={{ mb: 4 }}>
            {t('challenge.word.instruction', { language: preferredLanguage === 'fr' ? 'Français' : 'English' })}
          </Typography>

          {!challengeStarted && mode === 'challenge' && !user && (
            <Card sx={{ width: '100%', maxWidth: 500, mb: 3 }} elevation={3}>
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
                    {t('common.register')}
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
                <Button
                  variant="text"
                  color="primary"
                  size="small"
                  onClick={onBackHome}
                  fullWidth
                >
                  {t('common.back')}
                </Button>
              </CardContent>
            </Card>
          )}

          {!challengeStarted && mode === 'challenge' && user && (
            <Card sx={{ width: '100%', maxWidth: 500, mb: 3 }} elevation={3}>
              <CardContent sx={{ p: 4 }}>
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3, textAlign: 'center' }}>
                  {t('common.configureChallenge')}
                </Typography>
                <Box sx={{ mb: 3 }}>
                  <Typography variant="body2" gutterBottom>
                    {t('common.numberOfRounds')}: {maxTurns}
                  </Typography>
                  <Slider
                    value={maxTurns}
                    onChange={(_, value) => setMaxTurns(value as number)}
                    min={5}
                    max={50}
                    step={5}
                    valueLabelDisplay="auto"
                    sx={{ width: '100%' }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {t('common.numberOfRoundsHelper')}
                  </Typography>
                </Box>
                <Box sx={{ mb: 3 }}>
                  <Typography variant="body2" gutterBottom>
                    {t('common.difficulty')}: {difficulty}/10 ({difficulty === 0 ? 'All random' : difficulty === 10 ? 'All weak areas' : `${difficulty * 10}% weak areas`})
                  </Typography>
                  <Slider
                    value={difficulty}
                    onChange={(_, value) => setDifficulty(value as number)}
                    min={0}
                    max={10}
                    step={1}
                    valueLabelDisplay="auto"
                    sx={{ width: '100%' }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    0 = random words, 10 = focus on your weak areas
                  </Typography>
                </Box>
                <Box sx={{ mb: 3 }}>
                  <FormControl fullWidth>
                    <InputLabel>{t('common.usefulnessFilter')}</InputLabel>
                    <Select
                      value={minUsefulness}
                      onChange={(e) => setMinUsefulness(Number(e.target.value))}
                      label={t('common.usefulnessFilter')}
                    >
                      <MenuItem value={1}>{t('common.usefulness1Plus')}</MenuItem>
                      <MenuItem value={2}>{t('common.usefulness2Plus')}</MenuItem>
                      <MenuItem value={3}>{t('common.usefulness3')}</MenuItem>
                    </Select>
                    <FormHelperText>{t('common.usefulnessHelp')}</FormHelperText>
                  </FormControl>
                </Box>
                <Box sx={{ mb: 3 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={mobileFriendly}
                        onChange={(e) => setMobileFriendly(e.target.checked)}
                        color="primary"
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2">
                          {t('common.mobileFriendly')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t('common.mobileFriendlyHelper')}
                        </Typography>
                      </Box>
                    }
                  />
                </Box>
                <Box sx={{ mb: 3 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={practiceMode}
                        onChange={(e) => setPracticeMode(e.target.checked)}
                        color="primary"
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2">
                          {t('common.practiceMode')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t('common.practiceModeHelper')}
                        </Typography>
                      </Box>
                    }
                  />
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
                    onClick={generateChallengeSet}
                    fullWidth
                  >
                    {t('common.startChallenge')}
                  </Button>
                </Box>
              </CardContent>
            </Card>
          )}

          {challengeComplete && (
            <>
              <Alert severity="success" sx={{ mb: 3, maxWidth: 700 }}>
                {practiceMode 
                  ? `🎉 ${t('challenge.practiceModeComplete', { total: generatedChallenges.length })}`
                  : `${t('challenge.challengeComplete', { total: maxTurns })} 🎉`
                }
              </Alert>
              <Card sx={{ width: '100%', maxWidth: 700, mb: 3 }} elevation={3}>
                <CardContent sx={{ p: 4 }}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3, textAlign: 'center' }}>
                    {t('challenge.recap')}
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-around', mb: 3 }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h3" sx={{ color: 'success.main', fontWeight: 700 }}>
                        {correctCount}
                      </Typography>
                      <Typography variant="body1" color="text.secondary">
                        {t('challenge.correct')}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h3" sx={{ color: 'error.main', fontWeight: 700 }}>
                        {incorrectCount}
                      </Typography>
                      <Typography variant="body1" color="text.secondary">
                        {t('challenge.incorrect')}
                      </Typography>
                    </Box>
                    {practiceMode && (
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h3" sx={{ color: 'primary.main', fontWeight: 700 }}>
                          {turnCount}
                        </Typography>
                        <Typography variant="body1" color="text.secondary">
                          {t('challenge.totalAttempts')}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                  <Box sx={{ textAlign: 'center', mb: 3, pb: 3, borderBottom: 1, borderColor: 'divider' }}>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      {practiceMode
                        ? t('challenge.practiceModeSuccessRate', { 
                            correct: generatedChallenges.length, 
                            total: turnCount,
                            efficiency: ((generatedChallenges.length / turnCount) * 100).toFixed(1)
                          })
                        : `${t('challenge.successRate')}: ${((correctCount / maxTurns) * 100).toFixed(1)}%`
                      }
                    </Typography>
                  </Box>
                  
                  <Typography variant="h6" gutterBottom sx={{ mt: 3, mb: 2 }}>
                    Detailed Results
                  </Typography>
                  <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                    {attemptHistory.map((attempt, index) => (
                      <ListItem 
                        key={index}
                        sx={{ 
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 2,
                          mb: 1,
                          bgcolor: attempt.correct ? 'success.50' : 'error.50',
                          display: 'block',
                          py: 1.5
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                            {attempt.correct ? (
                              <CheckCircleIcon color="success" />
                            ) : (
                              <CancelIcon color="error" />
                            )}
                          </Box>
                          <Box sx={{ flex: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                              <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                                {attempt.challengeId}
                              </Typography>
                              <Chip 
                                icon={<TimerIcon />}
                                label={`${Math.round(attempt.timeSpent / 1000)}s`}
                                size="small"
                                variant="outlined"
                              />
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                              Your answer: <strong>{attempt.userAnswer}</strong>
                            </Typography>
                            {!attempt.correct && (
                              <Typography variant="body2" color="text.secondary">
                                Correct answer: <strong>{attempt.correctAnswer}</strong>
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
              <Button
                variant="contained"
                color="primary"
                size="large"
                onClick={onBackHome}
                sx={{ mb: 4 }}
              >
                {t('common.back')}
              </Button>
            </>
          )}

          {!challenge && !loading && !challengeComplete && challengeStarted && (
            <Button
              variant="contained"
              color="primary"
              size="large"
              onClick={fetchChallenge}
              sx={{ mb: 4 }}
            >
              {mode === 'challenge' ? t('common.startChallenge') : t('common.practice')}
            </Button>
          )}

          {loading && <CircularProgress sx={{ my: 4 }} />}

          {challenge && !challengeComplete && (
            <Card sx={{ width: '100%', maxWidth: 500, mt: 2 }} elevation={3}>
              <CardContent sx={{ p: 4 }}>
                <Box sx={{ textAlign: 'center', mb: 4 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {preferredLanguage === 'fr' ? 'Français' : 'English'}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    <Typography variant="h4" component="div" sx={{ fontWeight: 600, color: 'primary.main' }}>
                      {challenge[preferredLanguage].translation}
                    </Typography>
                    {audioAvailable && (
                      <IconButton 
                        onClick={playAudio}
                        color="primary"
                        size="large"
                        sx={{ 
                          '&:hover': { 
                            bgcolor: 'primary.lighter',
                            transform: 'scale(1.1)'
                          },
                          transition: 'all 0.2s'
                        }}
                      >
                        <VolumeUpIcon fontSize="large" />
                      </IconButton>
                    )}
                  </Box>
                  {challenge[preferredLanguage].use_exemple && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                      {challenge[preferredLanguage].use_exemple}
                    </Typography>
                  )}
                </Box>
                
                {mobileFriendly && challenge.options ? (
                  <Box sx={{ mb: 2 }}>
                    {challenge.options.map((option, index) => (
                      <Button
                        key={index}
                        fullWidth
                        variant={userAnswer === option ? "contained" : "outlined"}
                        color={userAnswer === option ? "primary" : "inherit"}
                        size="large"
                        onClick={() => {
                          if (!showAnswer) {
                            setUserAnswer(option);
                            // Use setTimeout with 0ms to ensure state update, then validate with option value
                            setTimeout(() => {
                              if (!showAnswer && challenge) {
                                // Manually validate using the option value directly
                                const normalizedAnswer = normalizeString(option);
                                const normalizedCorrect = normalizeString(challenge.port);
                                const isCorrect = normalizedAnswer === normalizedCorrect;
                                const timeSpent = Date.now() - startTime;

                                if (isCorrect) {
                                  const exampleText = challenge[preferredLanguage].port_exemple ? `\n"${challenge[preferredLanguage].port_exemple}"` : '';
                                  setFeedback({ type: 'success', message: `${t('challenge.correct')} ${challenge.port}${exampleText}` });
                                  setShowAnswer(true);
                                } else {
                                  const exampleText = challenge[preferredLanguage].port_exemple ? `\n"${challenge[preferredLanguage].port_exemple}"` : '';
                                  setFeedback({ type: 'error', message: `${t('challenge.incorrect')} ${challenge.port}${exampleText}` });
                                  setShowAnswer(true);
                                }

                                // Play audio to help with pronunciation after validation
                                if (audioAvailable) {
                                  playAudio();
                                }

                                // Submit attempt
                                submitChallengeAttempt(
                                  challenge.id,
                                  'word',
                                  isCorrect,
                                  option,
                                  challenge.port,
                                  timeSpent
                                );

                                // Increment turn count first
                                const newTurnCount = turnCount + 1;
                                setTurnCount(newTurnCount);

                                // Practice mode logic
                                if (practiceMode) {
                                  // Track attempt count for this challenge
                                  const currentAttempts = attemptCounts.get(challenge.id) || 0;
                                  setAttemptCounts(new Map(attemptCounts.set(challenge.id, currentAttempts + 1)));
                                  
                                  console.log('[Practice Mode - Mobile] Answer checked:', {
                                    challengeId: challenge.id,
                                    word: challenge.port,
                                    isCorrect,
                                    currentAttempts: currentAttempts + 1
                                  });
                                  
                                  let newMasteredSize = masteredChallenges.size;
                                  
                                  if (isCorrect) {
                                    // Mark as mastered
                                    const wasAlreadyMastered = masteredChallenges.has(challenge.id);
                                    const newMastered = new Set(masteredChallenges.add(challenge.id));
                                    setMasteredChallenges(newMastered);
                                    newMasteredSize = newMastered.size;
                                    // Only increment correctCount if this is a newly mastered challenge
                                    if (!wasAlreadyMastered) {
                                      setCorrectCount(prev => prev + 1);
                                    }
                                    console.log('[Practice Mode - Mobile] Challenge mastered!', {
                                      challengeId: challenge.id,
                                      word: challenge.port,
                                      wasAlreadyMastered,
                                      masteredCount: newMastered.size,
                                      totalChallenges: generatedChallenges.length,
                                      masteredIds: Array.from(newMastered),
                                      allChallengeIds: generatedChallenges.map(c => c.id)
                                    });
                                  } else if (!flaggedInSession.has(challenge.id)) {
                                    // Add back to queue for retry (skip if already flagged as bad quality)
                                    setPendingQueue(prev => {
                                      const newQueue = [...prev, challenge];
                                      console.log('[Practice Mode - Mobile] Challenge added to retry queue', {
                                        challengeId: challenge.id,
                                        queueLength: newQueue.length
                                      });
                                      return newQueue;
                                    });
                                    setIncorrectCount(prev => prev + 1);
                                  } else {
                                    setIncorrectCount(prev => prev + 1);
                                  }
                                  
                                  // Check completion: all challenges mastered or flagged
                                  console.log('[Practice Mode - Mobile] Completion check:', {
                                    masteredCount: newMasteredSize,
                                    totalChallenges: generatedChallenges.length,
                                    complete: newMasteredSize + flaggedInSession.size >= generatedChallenges.length
                                  });
                                  if (newMasteredSize + flaggedInSession.size >= generatedChallenges.length) {
                                    setChallengeComplete(true);
                                  }
                                } else {
                                  // Normal mode: just count
                                  if (isCorrect) {
                                    setCorrectCount(prev => prev + 1);
                                  } else {
                                    setIncorrectCount(prev => prev + 1);
                                  }
                                  
                                  // Check completion: all turns completed
                                  if (newTurnCount >= maxTurns) {
                                    setChallengeComplete(true);
                                  }
                                }

                                setAttemptHistory(prev => [{
                                  challengeId: challenge.port,
                                  userAnswer: option,
                                  correctAnswer: challenge.port,
                                  correct: isCorrect,
                                  timeSpent
                                }, ...prev]);
                              }
                            }, 300);
                          }
                        }}
                        disabled={showAnswer}
                        sx={{ 
                          mb: 1.5, 
                          justifyContent: 'flex-start',
                          textAlign: 'left',
                          py: 2,
                          textTransform: 'none',
                          fontSize: '1rem'
                        }}
                      >
                        {option}
                      </Button>
                    ))}
                  </Box>
                ) : (
                  <TextField
                    fullWidth
                    label={t('common.yourAnswer')}
                    variant="outlined"
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={showAnswer}
                    inputRef={inputRef}
                    sx={{ mb: 2 }}
                  />
                )}

                {feedback && (
                  <Alert severity={feedback.type} sx={{ mb: 2, whiteSpace: 'pre-line' }}>
                    {feedback.message}
                  </Alert>
                )}

                {feedback && challenge.fr.note && challenge.fr.note !== "todo" && showAnswer && (
                  <Box sx={{ mt: 2, mb: 2, p: 2, bgcolor: 'info.lighter', borderRadius: 1, border: '1px solid', borderColor: 'info.light' }}>
                    <Typography variant="subtitle2" color="info.dark" gutterBottom sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <InfoIcon fontSize="small" />
                      Note
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {challenge.fr.note}
                    </Typography>
                  </Box>
                )}

                {showAnswer && (
                  <WordUsefulnessVote
                    challengeId={challenge.id}
                    currentUsefulness={challenge.user_usefulness}
                    isGuest={user?.isGuest}
                    onVoteSubmit={(usefulness) => {
                      if (usefulness === 1) {
                        handleChallengeFlag(challenge.id);
                      }
                    }}
                  />
                )}

                {showAnswer && (
                  <ChallengeQualityFlag
                    challengeId={challenge.id}
                    isGuest={user?.isGuest}
                    onFlagSubmit={() => handleChallengeFlag(challenge.id)}
                  />
                )}

                {!showAnswer ? (
                  !mobileFriendly && (
                    <Button
                      variant="contained"
                      color="primary"
                      fullWidth
                      size="large"
                      onClick={checkAnswer}
                      disabled={!userAnswer.trim()}
                    >
                      {t('common.checkAnswer')}
                    </Button>
                  )
                ) : (
                  <Button
                    variant="contained"
                    color="primary"
                    fullWidth
                    size="large"
                    onClick={fetchChallenge}
                  >
                    {t('common.nextChallenge')}
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

export default ChallengePage;
