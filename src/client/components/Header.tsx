import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, Box, Chip, SwipeableDrawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Divider, IconButton, ToggleButton, ToggleButtonGroup } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import InfoIcon from '@mui/icons-material/Info';
import PersonIcon from '@mui/icons-material/Person';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import LoginIcon from '@mui/icons-material/Login';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import LanguageIcon from '@mui/icons-material/Language';
import { useTranslation } from 'react-i18next';

interface User {
  id: string;
  username: string;
  email?: string;
  isGuest?: boolean;
  guestExpiresAt?: string;
  preferredLanguage?: 'fr' | 'en';
}

interface HeaderProps {
  user: User | null;
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
  onNavigateHome,
  onNavigateAbout,
  onNavigateProfile,
  onLogout,
  onNavigateLogin,
  onNavigateRegister,
  showNavigation = true,
}) => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const currentPath = location.pathname;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLanguageChange = async (_: React.MouseEvent<HTMLElement>, newLanguage: 'fr' | 'en' | null) => {
    if (!newLanguage) return;
    
    localStorage.setItem('preferredLanguage', newLanguage);
    i18n.changeLanguage(newLanguage);

    // Update user preference if logged in
    if (user) {
      try {
        await fetch('/api/auth/update-language', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ preferredLanguage: newLanguage })
        });
      } catch (error) {
        console.error('Failed to update language preference:', error);
      }
    }
  };

  const currentLanguage = (user?.preferredLanguage || i18n.language || 'fr') as 'fr' | 'en';

  const handleDrawerToggle = () => {
    setDrawerOpen(!drawerOpen);
  };

  const handleDrawerClose = () => {
    setDrawerOpen(false);
  };

  const handleNavigation = (callback?: () => void) => {
    handleDrawerClose();
    if (callback) callback();
  };

  const drawerContent = (
    <Box
      sx={{ width: 280 }}
      role="presentation"
    >
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          🇵🇹 {t('common.appTitle')}
        </Typography>
        <IconButton onClick={handleDrawerClose} edge="end" aria-label="close menu">
          <CloseIcon />
        </IconButton>
      </Box>
      <Divider />

      <List sx={{ pt: 2 }}>
        {/* Navigation Items */}
        {currentPath !== '/' && (
          <ListItem disablePadding>
            <ListItemButton 
              onClick={() => handleNavigation(onNavigateHome)}
              sx={{ minHeight: 48, px: 2.5 }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                <HomeIcon color="primary" />
              </ListItemIcon>
              <ListItemText primary={t('common.home')} />
            </ListItemButton>
          </ListItem>
        )}

        {currentPath !== '/about' && (
          <ListItem disablePadding>
            <ListItemButton 
              onClick={() => handleNavigation(onNavigateAbout)}
              sx={{ minHeight: 48, px: 2.5 }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                <InfoIcon color="primary" />
              </ListItemIcon>
              <ListItemText primary={t('common.about')} />
            </ListItemButton>
          </ListItem>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Language Selector */}
        <ListItem sx={{ px: 2.5, flexDirection: 'column', alignItems: 'flex-start' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <LanguageIcon color="action" sx={{ mr: 1 }} />
            <Typography variant="body2" color="text.secondary">
              {t('common.language')}
            </Typography>
          </Box>
          <ToggleButtonGroup
            value={currentLanguage}
            exclusive
            onChange={handleLanguageChange}
            aria-label="language selection"
            size="small"
            fullWidth
            sx={{ width: '100%' }}
          >
            <ToggleButton value="fr" aria-label="French">
              🇫🇷 Français
            </ToggleButton>
            <ToggleButton value="en" aria-label="English">
              🇬🇧 English
            </ToggleButton>
          </ToggleButtonGroup>
        </ListItem>

        <Divider sx={{ my: 2 }} />

        {/* Auth Items */}
        {user ? (
          <>
            <ListItem disablePadding>
              <ListItemButton 
                onClick={() => handleNavigation(onNavigateProfile)}
                sx={{ minHeight: 48, px: 2.5 }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <PersonIcon color="primary" />
                </ListItemIcon>
                <ListItemText 
                  primary={user.username}
                  secondary={user.isGuest ? t('common.guestAccount') : user.email}
                />
              </ListItemButton>
            </ListItem>

            <ListItem disablePadding>
              <ListItemButton 
                onClick={() => handleNavigation(onLogout)}
                sx={{ minHeight: 48, px: 2.5 }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <LogoutIcon color="error" />
                </ListItemIcon>
                <ListItemText primary={t('common.logout')} />
              </ListItemButton>
            </ListItem>
          </>
        ) : (
          <>
            <ListItem disablePadding>
              <ListItemButton 
                onClick={() => handleNavigation(onNavigateLogin)}
                sx={{ minHeight: 48, px: 2.5 }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <LoginIcon color="primary" />
                </ListItemIcon>
                <ListItemText primary={t('common.login')} />
              </ListItemButton>
            </ListItem>

            <ListItem disablePadding>
              <ListItemButton 
                onClick={() => handleNavigation(onNavigateRegister)}
                sx={{ minHeight: 48, px: 2.5 }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <HowToRegIcon color="primary" />
                </ListItemIcon>
                <ListItemText primary={t('common.register')} />
              </ListItemButton>
            </ListItem>
          </>
        )}
      </List>
    </Box>
  );
  
  return (
    <>
      <AppBar position="fixed" elevation={2}>
        <Toolbar sx={{ minHeight: { xs: 56, sm: 64 } }}>
          {/* Mobile hamburger menu */}
          {showNavigation && (
            <IconButton
              color="inherit"
              aria-label="open menu"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2, display: { xs: 'block', md: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
          )}

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

          {/* Desktop navigation - hidden on mobile */}
          {showNavigation && (
            <Box sx={{ 
              display: { xs: 'none', md: 'flex' },
              alignItems: 'center', 
              gap: 2,
              flexShrink: 0,
            }}>
              {currentPath !== '/' && (
                <Button
                  color="inherit"
                  startIcon={<HomeIcon />}
                  onClick={onNavigateHome}
                  aria-label={t('common.home')}
                >
                  {t('common.home')}
                </Button>
              )}
              
              {currentPath !== '/about' && (
                <Button
                  color="inherit"
                  startIcon={<InfoIcon />}
                  onClick={onNavigateAbout}
                  aria-label={t('common.about')}
                >
                  {t('common.about')}
                </Button>
              )}

              {/* Desktop Language Selector */}
              <ToggleButtonGroup
                value={currentLanguage}
                exclusive
                onChange={handleLanguageChange}
                aria-label="language selection"
                size="small"
                sx={{
                  '& .MuiToggleButton-root': {
                    color: 'white',
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                    px: 1.5,
                    py: 0.5,
                    '&.Mui-selected': {
                      bgcolor: 'rgba(255, 255, 255, 0.2)',
                      color: 'white',
                      '&:hover': {
                        bgcolor: 'rgba(255, 255, 255, 0.3)',
                      }
                    },
                    '&:hover': {
                      bgcolor: 'rgba(255, 255, 255, 0.1)',
                    }
                  }
                }}
              >
                <ToggleButton value="fr" aria-label="French">
                  🇫🇷
                </ToggleButton>
                <ToggleButton value="en" aria-label="English">
                  🇬🇧
                </ToggleButton>
              </ToggleButtonGroup>
              
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
                  >
                    {t('common.logout')}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    color="inherit"
                    onClick={onNavigateLogin}
                  >
                    {t('common.login')}
                  </Button>
                  <Button
                    variant="outlined"
                    sx={{ 
                      color: 'white', 
                      borderColor: 'white',
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

          {/* Mobile: Show only profile chip or nothing */}
          {showNavigation && user && (
            <IconButton
              color="inherit"
              onClick={onNavigateProfile}
              sx={{ 
                display: { xs: 'block', md: 'none' },
                ml: 'auto'
              }}
              aria-label="profile"
            >
              <PersonIcon />
            </IconButton>
          )}
        </Toolbar>
      </AppBar>

      {/* Mobile Drawer */}
      <SwipeableDrawer
        anchor="left"
        open={drawerOpen}
        onClose={handleDrawerClose}
        onOpen={handleDrawerToggle}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: 280,
          },
        }}
      >
        {drawerContent}
      </SwipeableDrawer>
    </>
  );
};

export default Header;
