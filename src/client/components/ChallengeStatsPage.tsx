import React, { useEffect, useState } from 'react';
import {
  Container,
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  LinearProgress,
  Grid,
  Card,
  CardContent,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  Alert
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import TimerIcon from '@mui/icons-material/Timer';

interface ChallengeProgress {
  totalAttempts: number;
  correctAnswers: number;
  accuracy: number;
  streak: number;
  completedChallenges: number;
  lastAttemptDate?: string;
}

interface AttemptHistory {
  _id: string;
  challengeId: string;
  correct: boolean;
  userAnswer: string;
  correctAnswer: string;
  timeSpent?: number;
  attemptedAt: string;
}

interface ChallengeStatsPageProps {
  challengeType: 'word' | 'idiom' | 'verb';
  onBackHome: () => void;
  onStartChallenge: () => void;
}

const ChallengeStatsPage: React.FC<ChallengeStatsPageProps> = ({ 
  challengeType, 
  onBackHome,
  onStartChallenge
}) => {
  const [stats, setStats] = useState<ChallengeProgress | null>(null);
  const [history, setHistory] = useState<AttemptHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
    fetchHistory();
  }, [challengeType]);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/challenge/progress', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }
      
      const data = await response.json();
      setStats(data[challengeType]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await fetch(`/api/challenge/history?type=${challengeType}&limit=10`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  const getChallengeTitle = () => {
    switch (challengeType) {
      case 'word': return 'Word Challenge';
      case 'idiom': return 'Idiom Challenge';
      case 'verb': return 'Verb Challenge';
    }
  };

  const getChallengeColor = () => {
    switch (challengeType) {
      case 'word': return '#1976d2';
      case 'idiom': return '#ff9800';
      case 'verb': return '#dc004e';
    }
  };

  const formatTime = (ms?: number) => {
    if (!ms) return 'N/A';
    const seconds = Math.round(ms / 1000);
    return `${seconds}s`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <Box sx={{ pt: 10, pb: 6, bgcolor: 'background.default', minHeight: '100vh' }}>
        <Container maxWidth="md">
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
            <CircularProgress />
          </Box>
        </Container>
      </Box>
    );
  }

  if (error || !stats) {
    return (
      <Box sx={{ pt: 10, pb: 6, bgcolor: 'background.default', minHeight: '100vh' }}>
        <Container maxWidth="md">
          <Box sx={{ py: 4 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={onBackHome}
              sx={{ mb: 3 }}
            >
              Back to Home
            </Button>
            <Alert severity="error">
              {error || 'Failed to load statistics. Please make sure you are logged in.'}
            </Alert>
          </Box>
        </Container>
      </Box>
    );
  }

  const color = getChallengeColor();

  return (
    <Box sx={{ pt: 10, pb: 6, bgcolor: 'background.default', minHeight: '100vh' }}>
      <Container maxWidth="lg">
        <Box sx={{ py: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 4, gap: 2 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={onBackHome}
            >
              Back to Home
            </Button>
            <Typography variant="h4" component="h1" sx={{ flexGrow: 1 }}>
              {getChallengeTitle()} Statistics
            </Typography>
            <Button
              variant="contained"
              onClick={onStartChallenge}
              sx={{
                bgcolor: color,
                '&:hover': {
                  bgcolor: color,
                  filter: 'brightness(0.9)'
                }
              }}
            >
              Start Challenge
            </Button>
          </Box>

          <Grid container spacing={3}>
            {/* Overview Cards */}
            <Grid item xs={12} md={3}>
              <Card sx={{ bgcolor: `${color}10`, border: `2px solid ${color}40` }}>
                <CardContent sx={{ textAlign: 'center' }}>
                  <TrendingUpIcon sx={{ fontSize: 40, color, mb: 1 }} />
                  <Typography variant="h4" sx={{ color, fontWeight: 'bold' }}>
                    {stats.accuracy}%
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Accuracy
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={3}>
              <Card>
                <CardContent sx={{ textAlign: 'center' }}>
                  <CheckCircleIcon sx={{ fontSize: 40, color: 'success.main', mb: 1 }} />
                  <Typography variant="h4" fontWeight="bold">
                    {stats.correctAnswers}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Correct Answers
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={3}>
              <Card>
                <CardContent sx={{ textAlign: 'center' }}>
                  <LocalFireDepartmentIcon sx={{ fontSize: 40, color: 'orange', mb: 1 }} />
                  <Typography variant="h4" fontWeight="bold">
                    {stats.streak}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Day Streak
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={3}>
              <Card>
                <CardContent sx={{ textAlign: 'center' }}>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.completedChallenges}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Completed
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Detailed Stats */}
            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Progress Overview
                </Typography>
                <Divider sx={{ mb: 3 }} />
                
                <Box sx={{ mb: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Overall Accuracy
                    </Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {stats.accuracy}%
                    </Typography>
                  </Box>
                  <LinearProgress 
                    variant="determinate" 
                    value={stats.accuracy} 
                    sx={{ 
                      height: 10, 
                      borderRadius: 5,
                      backgroundColor: `${color}20`,
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: color
                      }
                    }}
                  />
                </Box>

                <Grid container spacing={2}>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">
                      Total Attempts
                    </Typography>
                    <Typography variant="h6">
                      {stats.totalAttempts}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">
                      Correct
                    </Typography>
                    <Typography variant="h6" color="success.main">
                      {stats.correctAnswers}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">
                      Incorrect
                    </Typography>
                    <Typography variant="h6" color="error.main">
                      {stats.totalAttempts - stats.correctAnswers}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">
                      Success Rate
                    </Typography>
                    <Typography variant="h6">
                      {stats.totalAttempts > 0 
                        ? `${Math.round((stats.correctAnswers / stats.totalAttempts) * 100)}%`
                        : '0%'}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Recent Activity */}
            {history.length > 0 && (
              <Grid item xs={12}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Recent Attempts
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  <List>
                    {history.map((attempt) => (
                      <ListItem 
                        key={attempt._id}
                        sx={{ 
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 2,
                          mb: 1,
                          bgcolor: attempt.correct ? 'success.50' : 'error.50'
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
                          {attempt.correct ? (
                            <CheckCircleIcon color="success" />
                          ) : (
                            <CancelIcon color="error" />
                          )}
                        </Box>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                              <Typography variant="body1" fontWeight="medium">
                                {attempt.challengeId}
                              </Typography>
                              {attempt.timeSpent && (
                                <Chip 
                                  icon={<TimerIcon />}
                                  label={formatTime(attempt.timeSpent)}
                                  size="small"
                                  variant="outlined"
                                />
                              )}
                              <Typography variant="caption" color="text.secondary">
                                {formatDate(attempt.attemptedAt)}
                              </Typography>
                            </Box>
                          }
                          secondary={
                            <Box sx={{ mt: 0.5 }}>
                              <Typography variant="body2" color="text.secondary">
                                Your answer: <strong>{attempt.userAnswer}</strong>
                              </Typography>
                              {!attempt.correct && (
                                <Typography variant="body2" color="text.secondary">
                                  Correct answer: <strong>{attempt.correctAnswer}</strong>
                                </Typography>
                              )}
                            </Box>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                </Paper>
              </Grid>
            )}

            {history.length === 0 && stats.totalAttempts === 0 && (
              <Grid item xs={12}>
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    No attempts yet
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Start your first challenge to see your statistics here!
                  </Typography>
                  <Button
                    variant="contained"
                    onClick={onStartChallenge}
                    sx={{
                      bgcolor: color,
                      '&:hover': {
                        bgcolor: color,
                        filter: 'brightness(0.9)'
                      }
                    }}
                  >
                    Start Now
                  </Button>
                </Paper>
              </Grid>
            )}
          </Grid>
        </Box>
      </Container>
    </Box>
  );
};

export default ChallengeStatsPage;
