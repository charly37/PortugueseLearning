import Challenge, { IChallenge } from './models/Challenge';

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
  console.log(
    `[cache] Loaded ${_wordChallenges.length} word, ` +
    `${_verbChallenges.length} verb, ` +
    `${_idiomChallenges.length} idiom challenges from MongoDB`
  );
}

export function startCacheRefresh(intervalMs?: number): void {
  const ms = intervalMs ?? parseInt(process.env.CHALLENGE_CACHE_TTL_MS || '300000', 10);
  setInterval(async () => {
    try {
      await loadFromDB();
      console.log(`[cache] Refreshed at ${new Date().toISOString()}`);
    } catch (err) {
      console.error('[cache] Refresh failed:', err);
    }
  }, ms);
}

export const getWordChallenges  = (): IChallenge[] => _wordChallenges;
export const getVerbChallenges  = (): IChallenge[] => _verbChallenges;
export const getIdiomChallenges = (): IChallenge[] => _idiomChallenges;
export const getAllChallenges   = (): IChallenge[] => [..._wordChallenges, ..._verbChallenges, ..._idiomChallenges];
