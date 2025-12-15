import React from 'react';
import { 
  Container, 
  Box, 
  Typography, 
  Button, 
  Paper,
  Avatar,
  Divider,
  Stack
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PersonIcon from '@mui/icons-material/Person';
import EmailIcon from '@mui/icons-material/Email';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';

interface User {
  id: string;
  username: string;
  email: string;
  createdAt?: string;
}

interface ProfilePageProps {
  user: User | null;
  onBackHome: () => void;
}

const ProfilePage: React.FC<ProfilePageProps> = ({ user, onBackHome }) => {
  if (!user) {
    return null;
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
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
          py: 4,
        }}
      >
        <Paper
          elevation={3}
          sx={{
            width: '100%',
            maxWidth: 600,
            p: 4,
            borderRadius: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={onBackHome}
              sx={{ mr: 2 }}
            >
              Back
            </Button>
            <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>
              My Profile
            </Typography>
          </Box>

          <Divider sx={{ mb: 4 }} />

          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4 }}>
            <Avatar
              sx={{
                width: 120,
                height: 120,
                bgcolor: 'primary.main',
                fontSize: '3rem',
                mb: 2,
              }}
            >
              {user.username.charAt(0).toUpperCase()}
            </Avatar>
            <Typography variant="h4" gutterBottom>
              {user.username}
            </Typography>
          </Box>

          <Stack spacing={3}>
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <PersonIcon color="primary" sx={{ fontSize: 32 }} />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Username
                </Typography>
                <Typography variant="body1" fontWeight="medium">
                  {user.username}
                </Typography>
              </Box>
            </Paper>

            <Paper
              variant="outlined"
              sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <EmailIcon color="primary" sx={{ fontSize: 32 }} />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Email
                </Typography>
                <Typography variant="body1" fontWeight="medium">
                  {user.email}
                </Typography>
              </Box>
            </Paper>

            <Paper
              variant="outlined"
              sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <CalendarTodayIcon color="primary" sx={{ fontSize: 32 }} />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Member Since
                </Typography>
                <Typography variant="body1" fontWeight="medium">
                  {formatDate(user.createdAt)}
                </Typography>
              </Box>
            </Paper>
          </Stack>

          <Box sx={{ mt: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Keep learning and improving your Portuguese skills!
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default ProfilePage;
