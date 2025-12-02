import React, { useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import LandingPage from './components/LandingPage';
import ChallengePage from './components/ChallengePage';
import VerbChallengePage from './components/VerbChallengePage';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

type PageType = 'landing' | 'challenge' | 'verb-challenge';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageType>('landing');

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {currentPage === 'landing' ? (
        <LandingPage 
          onStartLearning={() => setCurrentPage('challenge')}
          onVerbChallenge={() => setCurrentPage('verb-challenge')}
        />
      ) : currentPage === 'challenge' ? (
        <ChallengePage onBackHome={() => setCurrentPage('landing')} />
      ) : (
        <VerbChallengePage onBackHome={() => setCurrentPage('landing')} />
      )}
    </ThemeProvider>
  );
};

export default App;
