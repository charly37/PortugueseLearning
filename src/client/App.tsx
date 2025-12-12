import React, { useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import LandingPage from './components/LandingPage';
import ChallengePage from './components/ChallengePage';
import VerbChallengePage from './components/VerbChallengePage';
import IdiomChallengePage from './components/IdiomChallengePage';

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

type PageType = 'landing' | 'challenge' | 'verb-challenge' | 'idiom-challenge';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageType>('landing');

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {currentPage === 'landing' ? (
        <LandingPage 
          onStartLearning={() => setCurrentPage('challenge')}
          onVerbChallenge={() => setCurrentPage('verb-challenge')}
          onIdiomChallenge={() => setCurrentPage('idiom-challenge')}
        />
      ) : currentPage === 'challenge' ? (
        <ChallengePage onBackHome={() => setCurrentPage('landing')} />
      ) : currentPage === 'verb-challenge' ? (
        <VerbChallengePage onBackHome={() => setCurrentPage('landing')} />
      ) : (
        <IdiomChallengePage onBackHome={() => setCurrentPage('landing')} />
      )}
    </ThemeProvider>
  );
};

export default App;
