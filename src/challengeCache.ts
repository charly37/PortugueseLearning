import Challenge, { IChallenge } from './models/Challenge';
import logger from './logger';

const log = logger.child({ module: 'challenge-cache' });

// Typed cache arrays — replaced atomically on each refresh
let _wordChallenges: IChallenge[] = [];
let _verbChallenges: IChallenge[] = [];
let _idiomChallenges: IChallenge[] = [];

async function loadFromDB(): Promise<void> {
  const all = await Challenge.find({}).lean<IChallenge[]>();
  const word: IChallenge[] = [];
  const verb: IChallenge[] = [];
  const idiom: IChallenge[] = [];

  for (const doc of all) {
    // Expose the UUID as `id` so existing route code (challenge.id) works unchanged
    (doc as any).id = (doc as any)._id;
    if (doc.type === 'word')       word.push(doc);
    else if (doc.type === 'verb')  verb.push(doc);
    else if (doc.type === 'idiom') idiom.push(doc);
  }

  // Atomic swap — no request ever sees a partial array
  _wordChallenges  = word;
  _verbChallenges  = verb;
  _idiomChallenges = idiom;
}

export async function initCache(): Promise<void> {
  await loadFromDB();
  log.info(
    {
      word: _wordChallenges.length,
      verb: _verbChallenges.length,
      idiom: _idiomChallenges.length,
    },
    'challenge cache loaded'
  );
}

export function startCacheRefresh(intervalMs?: number): void {
  const ms = intervalMs ?? parseInt(process.env.CHALLENGE_CACHE_TTL_MS || '300000', 10);
  setInterval(async () => {
    try {
      await loadFromDB();
      log.debug('challenge cache refreshed');
    } catch (err) {
      log.error({ err }, 'challenge cache refresh failed');
    }
  }, ms);
}

export const getWordChallenges  = (): IChallenge[] => _wordChallenges;
export const getVerbChallenges  = (): IChallenge[] => _verbChallenges;
export const getIdiomChallenges = (): IChallenge[] => _idiomChallenges;
export const getAllChallenges   = (): IChallenge[] => [..._wordChallenges, ..._verbChallenges, ..._idiomChallenges];
