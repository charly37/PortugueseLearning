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
import PodcastsIcon from '@mui/icons-material/Podcasts';
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
  onNavigatePodcasts?: () => void;
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
  onNavigatePodcasts,
  onNavigateProfile,
  onLogout,
  onNavigateLogin,
  onNavigateRegister,
  showNavigation = true,
}) => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  // Normalize trailing slashes so '/about/' still matches '/about'
  const currentPath = location.pathname.replace(/\/+$/, '') || '/';
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

  // Single source of truth for the page links shown in the header and the drawer.
  // All links are always visible; the current page is highlighted instead of hidden.
  const navItems: { label: string; icon: React.ReactNode; path: string; onClick?: () => void }[] = [
    { label: t('common.home'), icon: <HomeIcon />, path: '/', onClick: onNavigateHome },
    { label: t('common.about'), icon: <InfoIcon />, path: '/about', onClick: onNavigateAbout },
    { label: t('common.podcasts'), icon: <PodcastsIcon />, path: '/podcasts', onClick: onNavigatePodcasts },
  ];

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
        {/* Navigation Items - always visible, current page highlighted */}
        {navItems.map((item) => {
          const isActive = currentPath === item.path;
          return (
            <ListItem key={item.path} disablePadding>
              <ListItemButton
                onClick={() => handleNavigation(item.onClick)}
                selected={isActive}
                aria-current={isActive ? 'page' : undefined}
                sx={{
                  minHeight: 48,
                  px: 2.5,
                  mx: 1,
                  borderRadius: 1,
                  bgcolor: isActive ? 'rgba(0, 0, 0, 0.10)' : 'transparent',
                  '&.Mui-selected, &.Mui-selected:hover': {
                    bgcolor: 'rgba(0, 0, 0, 0.10)',
                  },
                  '& .MuiListItemText-primary': {
                    fontWeight: isActive ? 600 : 400,
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: isActive ? 'primary.main' : 'text.secondary' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          );
        })}

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
              {navItems.map((item) => {
                const isActive = currentPath === item.path;
                return (
                  <Button
                    key={item.path}
                    color="inherit"
                    startIcon={item.icon}
                    onClick={item.onClick}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    sx={{
                      fontWeight: isActive ? 700 : 500,
                      bgcolor: isActive ? 'rgba(0, 0, 0, 0.18)' : 'transparent',
                      '&:hover': {
                        bgcolor: isActive ? 'rgba(0, 0, 0, 0.26)' : 'rgba(255, 255, 255, 0.1)',
                      },
                    }}
                  >
                    {item.label}
                  </Button>
                );
              })}

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
