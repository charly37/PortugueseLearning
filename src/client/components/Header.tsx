import React from 'react';
import { AppBar, Toolbar, Typography, Button, Box, Chip } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import InfoIcon from '@mui/icons-material/Info';
import PersonIcon from '@mui/icons-material/Person';
import LogoutIcon from '@mui/icons-material/Logout';
import { useTranslation } from 'react-i18next';

interface User {
  id: string;
  username: string;
  email?: string;
  isGuest?: boolean;
  guestExpiresAt?: string;
}

interface HeaderProps {
  user: User | null;
  currentPage: string;
  onNavigateHome?: () => void;
  onNavigateAbout?: () => void;
  onNavigateProfile?: () => void;
  onLogout?: () => void;
  onNavigateLogin?: () => void;
  onNavigateRegister?: () => void;
  showNavigation?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  user,
  currentPage,
  onNavigateHome,
  onNavigateAbout,
  onNavigateProfile,
  onLogout,
  onNavigateLogin,
  onNavigateRegister,
  showNavigation = true,
}) => {
  const { t } = useTranslation();
  
  return (
    <AppBar position="fixed" elevation={2}>
      <Toolbar sx={{ minHeight: { xs: 56, sm: 64 } }}>
        <Typography 
          variant="h6" 
          component="div" 
          sx={{ 
            flexGrow: 0, 
            mr: { xs: 1, sm: 4 }, 
            fontWeight: 600,
            fontSize: { xs: '1rem', sm: '1.25rem' },
            whiteSpace: 'nowrap',
          }}
        >
          🇵🇹 {t('common.appTitle')}
        </Typography>

        <Box sx={{ flexGrow: 1 }} />

        {showNavigation && (
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: { xs: 0.5, sm: 2 },
            flexShrink: 0,
          }}>
            {currentPage !== 'landing' && (
              <Button
                color="inherit"
                startIcon={<HomeIcon />}
                onClick={onNavigateHome}
                aria-label={t('common.home')}
                sx={{ minWidth: { xs: 'auto', sm: '64px' } }}
              >
                <Box sx={{ display: { xs: 'none', sm: 'inline' } }}>{t('common.home')}</Box>
              </Button>
            )}
            
            {currentPage !== 'about' && (
              <Button
                color="inherit"
                startIcon={<InfoIcon />}
                onClick={onNavigateAbout}
                aria-label={t('common.about')}
                sx={{ minWidth: { xs: 'auto', sm: '64px' } }}
              >
                <Box sx={{ display: { xs: 'none', sm: 'inline' } }}>{t('common.about')}</Box>
              </Button>
            )}
            
            {user ? (
              <>
                <Chip
                  icon={<PersonIcon />}
                  label={user.username}
                  onClick={onNavigateProfile}
                  sx={{
                    bgcolor: 'rgba(255, 255, 255, 0.15)',
                    color: 'white',
                    cursor: 'pointer',
                    maxWidth: { xs: '120px', sm: 'none' },
                    '& .MuiChip-label': {
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    },
                    '&:hover': {
                      bgcolor: 'rgba(255, 255, 255, 0.25)',
                    },
                  }}
                />
                
                <Button
                  color="inherit"
                  startIcon={<LogoutIcon />}
                  onClick={onLogout}
                  aria-label={t('common.logout')}
                  sx={{ minWidth: { xs: 'auto', sm: '64px' } }}
                >
                  <Box sx={{ display: { xs: 'none', sm: 'inline' } }}>{t('common.logout')}</Box>
                </Button>
              </>
            ) : (
              <>
                <Button
                  color="inherit"
                  onClick={onNavigateLogin}
                  size="small"
                  sx={{ minWidth: { xs: 'auto', sm: '64px' }, px: { xs: 1, sm: 2 } }}
                >
                  {t('common.login')}
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  sx={{ 
                    color: 'white', 
                    borderColor: 'white',
                    minWidth: { xs: 'auto', sm: '64px' },
                    px: { xs: 1, sm: 2 },
                    '&:hover': {
                      borderColor: 'white',
                      bgcolor: 'rgba(255, 255, 255, 0.1)',
                    }
                  }}
                  onClick={onNavigateRegister}
                >
                  {t('common.register')}
                </Button>
              </>
            )}
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
};

export default Header;
