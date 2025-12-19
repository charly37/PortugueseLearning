import React from 'react';
import { AppBar, Toolbar, Typography, Button, Box, Chip } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import PersonIcon from '@mui/icons-material/Person';
import LogoutIcon from '@mui/icons-material/Logout';

interface User {
  id: string;
  username: string;
  email: string;
}

interface HeaderProps {
  user: User | null;
  currentPage: string;
  onNavigateHome?: () => void;
  onNavigateProfile?: () => void;
  onLogout?: () => void;
  showNavigation?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  user,
  currentPage,
  onNavigateHome,
  onNavigateProfile,
  onLogout,
  showNavigation = true,
}) => {
  return (
    <AppBar position="fixed" elevation={2}>
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 0, mr: 4, fontWeight: 600 }}>
          🇵🇹 Portuguese Learning
        </Typography>

        <Box sx={{ flexGrow: 1 }} />

        {user && showNavigation && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {currentPage !== 'landing' && (
              <Button
                color="inherit"
                startIcon={<HomeIcon />}
                onClick={onNavigateHome}
              >
                Home
              </Button>
            )}
            
            <Chip
              icon={<PersonIcon />}
              label={user.username}
              onClick={onNavigateProfile}
              sx={{
                bgcolor: 'rgba(255, 255, 255, 0.15)',
                color: 'white',
                cursor: 'pointer',
                '&:hover': {
                  bgcolor: 'rgba(255, 255, 255, 0.25)',
                },
              }}
            />
            
            <Button
              color="inherit"
              startIcon={<LogoutIcon />}
              onClick={onLogout}
            >
              Logout
            </Button>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
};

export default Header;
