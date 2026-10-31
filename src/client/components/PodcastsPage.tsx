import React, { useEffect, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  List,
  ListItem,
  ListItemText,
  Snackbar,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import PodcastsIcon from '@mui/icons-material/Podcasts';
import DownloadIcon from '@mui/icons-material/Download';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RssFeedIcon from '@mui/icons-material/RssFeed';
import { useTranslation } from 'react-i18next';

interface PodcastEpisode {
  episodeNumber: number;
  docId: string;
  title: string;
  pubDate: string;
  filename: string;
  audioUrl: string;
  sizeBytes: number;
  durationSeconds: number | null;
}

interface PodcastShow {
  pair: string;
  show: string;
  nativeLanguage: string;
  feedUrl: string;
  coverUrl: string;
  episodes: PodcastEpisode[];
}

interface EpisodeWord {
  portuguese: string;
  translation_fr: string;
  translation_en: string;
}

interface WordListState {
  status: 'loading' | 'ready' | 'error';
  words?: EpisodeWord[];
}

// Public show pages for the podcast platforms, filled in once the shows are
// accepted there. While an entry is missing the button is not rendered.
const SHOW_LINKS: Record<string, { apple?: string; spotify?: string }> = {
  'fr-pt': {},
  'en-pt': {},
};

const formatDate = (isoDate: string, locale: string): string => {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

const formatDuration = (seconds: number | null): string => {
  if (!seconds || seconds <= 0) return '';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => value.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
};

const formatSize = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const PodcastsPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [shows, setShows] = useState<PodcastShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const [wordLists, setWordLists] = useState<Record<string, WordListState>>({});
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadShows = async () => {
      setLoading(true);
      setError(null);
      try {
        // Public endpoint: no credentials needed, the podcast is free content.
        const response = await fetch('/api/podcasts');
        if (!response.ok) {
          throw new Error(t('podcasts.error'));
        }
        const data = await response.json();
        if (cancelled) return;
        const fetchedShows: PodcastShow[] = Array.isArray(data.shows) ? data.shows : [];
        setShows(fetchedShows);
        setSelectedPair(fetchedShows.length > 0 ? fetchedShows[0].pair : null);
      } catch {
        if (!cancelled) setError(t('podcasts.error'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadShows();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const loadWords = async (pair: string, docId: string) => {
    if (wordLists[docId] && wordLists[docId].status !== 'error') return;

    setWordLists(previous => ({ ...previous, [docId]: { status: 'loading' } }));
    try {
      const response = await fetch(`/api/podcasts/${pair}/episodes/${docId}/words`);
      if (!response.ok) {
        throw new Error('Failed to load words');
      }
      const data = await response.json();
      setWordLists(previous => ({
        ...previous,
        [docId]: { status: 'ready', words: Array.isArray(data.words) ? data.words : [] },
      }));
    } catch {
      setWordLists(previous => ({ ...previous, [docId]: { status: 'error' } }));
    }
  };

  const copyFeedUrl = async (feedUrl: string) => {
    try {
      await navigator.clipboard.writeText(new URL(feedUrl, window.location.origin).toString());
      setLinkCopied(true);
    } catch {
      setLinkCopied(false);
    }
  };

  const selectedShow = shows.find(show => show.pair === selectedPair) || shows[0] || null;
  const translationKey = (nativeLanguage: string) =>
    nativeLanguage === 'en' ? 'translation_en' : 'translation_fr';

  return (
    <Box sx={{ pt: 10, pb: 6, bgcolor: 'background.default', minHeight: '100vh' }}>
      <Container maxWidth="md">
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <PodcastsIcon sx={{ fontSize: 64, color: 'secondary.main', mb: 1 }} />
          <Typography variant="h3" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
            {t('podcasts.title')}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t('podcasts.description')}
          </Typography>
        </Box>

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {!loading && error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && shows.length > 1 && (
          <Tabs
            value={selectedPair ?? shows[0].pair}
            onChange={(_, value: string) => setSelectedPair(value)}
            variant="scrollable"
            allowScrollButtonsMobile
            textColor="secondary"
            indicatorColor="secondary"
            sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
          >
            {shows.map(show => (
              <Tab
                key={show.pair}
                value={show.pair}
                label={t(`podcasts.pairLabel.${show.nativeLanguage}`, { defaultValue: show.pair })}
              />
            ))}
          </Tabs>
        )}

        {!loading && !error && selectedShow && (
          <>
            <Card elevation={3} sx={{ mb: 3 }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Box
                    component="img"
                    src={selectedShow.coverUrl}
                    alt={t('podcasts.coverAlt')}
                    sx={{ width: 96, height: 96, borderRadius: 2, objectFit: 'cover', flexShrink: 0 }}
                  />
                  <Box sx={{ flexGrow: 1, minWidth: 200 }}>
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>
                      {t('podcasts.showTitle')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {t('podcasts.showSubtitle')}
                    </Typography>
                  </Box>
                </Box>

                <Divider sx={{ my: 2 }} />

                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  {t('podcasts.subscribe')}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<RssFeedIcon />}
                    onClick={() => copyFeedUrl(selectedShow.feedUrl)}
                  >
                    {t('podcasts.copyRss')}
                  </Button>
                  {SHOW_LINKS[selectedShow.pair]?.apple && (
                    <Button
                      variant="outlined"
                      size="small"
                      component="a"
                      href={SHOW_LINKS[selectedShow.pair].apple}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('podcasts.applePodcasts')}
                    </Button>
                  )}
                  {SHOW_LINKS[selectedShow.pair]?.spotify && (
                    <Button
                      variant="outlined"
                      size="small"
                      component="a"
                      href={SHOW_LINKS[selectedShow.pair].spotify}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('podcasts.spotify')}
                    </Button>
                  )}
                </Box>
              </CardContent>
            </Card>

            {selectedShow.episodes.length === 0 && (
              <Card elevation={2}>
                <CardContent sx={{ p: 4, textAlign: 'center' }}>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                    {t('podcasts.emptyTitle')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('podcasts.emptyBody')}
                  </Typography>
                </CardContent>
              </Card>
            )}

            {selectedShow.episodes.map(episode => {
              const wordsState = wordLists[episode.docId];
              const duration = formatDuration(episode.durationSeconds);
              const size = formatSize(episode.sizeBytes);

              return (
                <Card key={episode.docId} elevation={2} sx={{ mb: 2 }}>
                  <CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
                      <Box
                        component="img"
                        src={selectedShow.coverUrl}
                        alt=""
                        aria-hidden="true"
                        sx={{ width: 56, height: 56, borderRadius: 1.5, objectFit: 'cover', flexShrink: 0 }}
                      />
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography
                          variant="subtitle1"
                          sx={{ fontWeight: 600, lineHeight: 1.3 }}
                        >
                          {episode.title || t('podcasts.episodeFallback', { number: episode.episodeNumber })}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                          <Chip
                            label={t('podcasts.episodeNumber', { number: episode.episodeNumber })}
                            size="small"
                            color="secondary"
                            variant="outlined"
                          />
                          {episode.pubDate && (
                            <Chip label={formatDate(episode.pubDate, i18n.language)} size="small" variant="outlined" />
                          )}
                          {duration && (
                            <Chip
                              label={t('podcasts.duration', { duration })}
                              size="small"
                              variant="outlined"
                            />
                          )}
                          {size && (
                            <Chip label={t('podcasts.fileSize', { size })} size="small" variant="outlined" />
                          )}
                        </Box>
                      </Box>
                    </Box>

                    <Box sx={{ mb: 2 }}>
                      <audio
                        controls
                        preload="metadata"
                        src={episode.audioUrl}
                        aria-label={episode.title}
                        style={{ width: '100%' }}
                      >
                        {t('podcasts.audioUnsupported')}
                      </audio>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Button
                        variant="contained"
                        color="secondary"
                        startIcon={<DownloadIcon />}
                        component="a"
                        href={episode.audioUrl}
                        download={episode.filename}
                      >
                        {t('podcasts.download')}
                      </Button>
                    </Box>

                    <Accordion
                      disableGutters
                      elevation={0}
                      onChange={(_, isExpanded) => {
                        if (isExpanded) {
                          loadWords(selectedShow.pair, episode.docId);
                        }
                      }}
                      sx={{ mt: 2, border: 1, borderColor: 'divider', borderRadius: 2, '&:before': { display: 'none' } }}
                    >
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {t('podcasts.wordList')}
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        {!wordsState || wordsState.status === 'loading' ? (
                          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                            <CircularProgress size={24} />
                          </Box>
                        ) : wordsState.status === 'error' ? (
                          <Alert severity="warning">{t('podcasts.wordListError')}</Alert>
                        ) : (wordsState.words || []).length === 0 ? (
                          <Typography variant="body2" color="text.secondary">
                            {t('podcasts.wordListEmpty')}
                          </Typography>
                        ) : (
                          <>
                            <Typography variant="caption" color="text.secondary">
                              {t('podcasts.wordCount', { count: (wordsState.words || []).length })}
                            </Typography>
                            <List dense>
                              {(wordsState.words || []).map((word, index) => (
                                <ListItem key={`${episode.docId}-${index}`} divider>
                                  <ListItemText
                                    primary={word.portuguese}
                                    secondary={word[translationKey(selectedShow.nativeLanguage)] || ''}
                                    slotProps={{ primary: { sx: { fontWeight: 600 } } }}
                                  />
                                </ListItem>
                              ))}
                            </List>
                          </>
                        )}
                      </AccordionDetails>
                    </Accordion>
                  </CardContent>
                </Card>
              );
            })}
          </>
        )}

        <Snackbar
          open={linkCopied}
          autoHideDuration={3000}
          onClose={() => setLinkCopied(false)}
          message={t('podcasts.copied')}
        />
      </Container>
    </Box>
  );
};

export default PodcastsPage;
