import React from 'react';
import { Container, Box, Typography, Paper, Grid, Divider } from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import TranslateIcon from '@mui/icons-material/Translate';
import SchoolIcon from '@mui/icons-material/School';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import PersonIcon from '@mui/icons-material/Person';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useTranslation } from 'react-i18next';

const AboutPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <Box sx={{ pt: 10, pb: 6, bgcolor: 'background.default', minHeight: '100vh' }}>
      <Container maxWidth="lg">
        <Box sx={{ py: 6 }}>
          {/* Header */}
          <Box sx={{ textAlign: 'center', mb: 6 }}>
            <InfoIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
            <Typography variant="h3" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
              {t('about.title')}
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ maxWidth: '700px', mx: 'auto' }}>
              {t('about.subtitle')}
            </Typography>
          </Box>

          {/* What is Portuguese Learning */}
          <Paper elevation={2} sx={{ p: 4, mb: 4 }}>
            <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
              {t('about.purposeTitle')}
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              {t('about.purposeText')}
            </Typography>
          </Paper>

          {/* Language Options */}
          <Paper elevation={2} sx={{ p: 4, mb: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <TranslateIcon sx={{ fontSize: 32, color: 'primary.main', mr: 2 }} />
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                {t('about.languagesTitle')}
              </Typography>
            </Box>
            <Typography variant="body1" color="text.secondary" paragraph>
              {t('about.languagesText')}
            </Typography>
          </Paper>

          {/* Challenge Types */}
          <Paper elevation={2} sx={{ p: 4, mb: 4 }}>
            <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
              {t('about.challengeTypesTitle')}
            </Typography>
            
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  <TranslateIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                    {t('about.wordChallengeTitle')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('about.wordChallengeText')}
                  </Typography>
                </Box>
              </Grid>

              <Grid item xs={12} md={4}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  <SchoolIcon sx={{ fontSize: 48, color: 'secondary.main', mb: 2 }} />
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                    {t('about.verbChallengeTitle')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('about.verbChallengeText')}
                  </Typography>
                </Box>
              </Grid>

              <Grid item xs={12} md={4}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  <RecordVoiceOverIcon sx={{ fontSize: 48, color: '#ff9800', mb: 2 }} />
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                    {t('about.idiomChallengeTitle')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('about.idiomChallengeText')}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>

          {/* Guest vs Registered Accounts */}
          <Paper elevation={2} sx={{ p: 4 }}>
            <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
              {t('about.accountTypesTitle')}
            </Typography>
            
            <Grid container spacing={4}>
              {/* Guest Account */}
              <Grid item xs={12} md={6}>
                <Box sx={{ 
                  p: 3, 
                  border: '2px solid',
                  borderColor: 'info.main',
                  borderRadius: 2,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <PersonIcon sx={{ fontSize: 32, color: 'info.main', mr: 1 }} />
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>
                      {t('about.guestAccountTitle')}
                    </Typography>
                  </Box>
                  
                  <Typography variant="body1" color="text.secondary" paragraph>
                    {t('about.guestAccountText')}
                  </Typography>
                  
                  <Divider sx={{ my: 2 }} />
                  
                  <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                    Features:
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {t('about.guestAccountFeatures').split(', ').map((feature, index) => (
                      <Box key={index} sx={{ display: 'flex', alignItems: 'center' }}>
                        <CheckCircleIcon sx={{ fontSize: 18, color: 'info.main', mr: 1 }} />
                        <Typography variant="body2" color="text.secondary">
                          {feature}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Grid>

              {/* Registered Account */}
              <Grid item xs={12} md={6}>
                <Box sx={{ 
                  p: 3, 
                  border: '2px solid',
                  borderColor: 'success.main',
                  borderRadius: 2,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <PersonAddIcon sx={{ fontSize: 32, color: 'success.main', mr: 1 }} />
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>
                      {t('about.registeredAccountTitle')}
                    </Typography>
                  </Box>
                  
                  <Typography variant="body1" color="text.secondary" paragraph>
                    {t('about.registeredAccountText')}
                  </Typography>
                  
                  <Divider sx={{ my: 2 }} />
                  
                  <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                    Features:
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {t('about.registeredAccountFeatures').split(', ').map((feature, index) => (
                      <Box key={index} sx={{ display: 'flex', alignItems: 'center' }}>
                        <CheckCircleIcon sx={{ fontSize: 18, color: 'success.main', mr: 1 }} />
                        <Typography variant="body2" color="text.secondary">
                          {feature}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Grid>
            </Grid>

            <Box sx={{ 
              mt: 3, 
              p: 2, 
              bgcolor: 'info.light',
              borderRadius: 2,
              textAlign: 'center'
            }}>
              <Typography variant="body1" sx={{ fontWeight: 500, color: 'info.dark' }}>
                💡 {t('about.upgradeAnytime')}
              </Typography>
            </Box>
          </Paper>

          {/* Get Started Section */}
          <Box sx={{ mt: 6, textAlign: 'center' }}>
            <Typography variant="h4" gutterBottom sx={{ fontWeight: 600 }}>
              {t('about.getStartedTitle')}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {t('about.getStartedText')}
            </Typography>
          </Box>
        </Box>
      </Container>
    </Box>
  );
};

export default AboutPage;
