import React, { useState } from 'react';
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  Link,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  FormControl,
  FormLabel
} from '@mui/material';
import LanguageIcon from '@mui/icons-material/Language';
import { useTranslation } from 'react-i18next';

interface RegisterPageProps {
  onRegisterSuccess: (user: { id: string; username: string; email?: string }) => void;
  onNavigateToLogin: () => void;
  onContinueAsGuest?: () => void;
  user?: { id: string; username: string; email?: string; isGuest?: boolean } | null;
}

const RegisterPage: React.FC<RegisterPageProps> = ({ onRegisterSuccess, onNavigateToLogin, onContinueAsGuest, user }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState<'fr' | 'en'>(() => {
    const stored = localStorage.getItem('preferredLanguage');
    return (stored === 'fr' || stored === 'en') ? stored : 'fr';
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password length
    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    // Validate username length
    if (username.length < 3) {
      setError('Username must be at least 3 characters long');
      return;
    }

    setLoading(true);

    try {
      // Use register-from-guest endpoint if user is a guest
      const endpoint = user?.isGuest ? '/api/auth/register-from-guest' : '/api/auth/register';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, email, password, preferredLanguage }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Registration failed');
        setLoading(false);
        return;
      }

      const data = await response.json();
      onRegisterSuccess(data.user);
    } catch (err) {
      console.error('Registration error:', err);
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          py: 4,
        }}
      >
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Typography variant="h4" component="h1" gutterBottom align="center">
            {user?.isGuest ? t('guest.upgradeTitle') : t('auth.registerTitle')}
          </Typography>
          
          {user?.isGuest ? (
            <Alert severity="info" sx={{ mb: 3 }}>
              <Typography variant="body2">
                {t('guest.upgradeMessage')}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, fontWeight: 600 }}>
                {t('guest.keepProgress')}
              </Typography>
            </Alert>
          ) : (
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
              {t('auth.createAccount')}
            </Typography>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label={t('auth.username')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              margin="normal"
              autoComplete="username"
              helperText={t('auth.atLeastChars', { count: 3 })}
            />

            <TextField
              fullWidth
              label={t('auth.email')}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              margin="normal"
              autoComplete="email"
            />

            <FormControl fullWidth margin="normal">
              <FormLabel sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <LanguageIcon fontSize="small" />
                <Typography variant="body1">{t('auth.iSpeak')}</Typography>
              </FormLabel>
              <ToggleButtonGroup
                value={preferredLanguage}
                exclusive
                onChange={(_, newLang) => newLang && setPreferredLanguage(newLang)}
                aria-label="preferred language"
                fullWidth
              >
                <ToggleButton value="fr" aria-label="French">
                  🇫🇷 Français (French)
                </ToggleButton>
                <ToggleButton value="en" aria-label="English">
                  🇬🇧 English
                </ToggleButton>
              </ToggleButtonGroup>
            </FormControl>
            
            <TextField
              fullWidth
              label={t('auth.password')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              margin="normal"
              autoComplete="new-password"
              helperText={t('auth.atLeastChars', { count: 6 })}
            />

            <TextField
              fullWidth
              label={t('auth.confirmPassword')}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              margin="normal"
              autoComplete="new-password"
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              color="primary"
              size="large"
              disabled={loading}
              sx={{ mt: 3, mb: 2 }}
            >
              {loading ? `${t('auth.registerTitle')}...` : t('auth.registerTitle')}
            </Button>
          </form>

          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Typography variant="body2">
              {t('auth.hasAccount')}{' '}
              <Link
                component="button"
                variant="body2"
                onClick={onNavigateToLogin}
                sx={{ cursor: 'pointer' }}
              >
                {t('auth.signIn')}
              </Link>
            </Typography>
          </Box>

          {onContinueAsGuest && (
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Button
                variant="text"
                onClick={onContinueAsGuest}
                sx={{ textTransform: 'none' }}
              >
                Continue as Guest
              </Button>
            </Box>
          )}
        </Paper>
      </Box>
    </Container>
  );
};

export default RegisterPage;
