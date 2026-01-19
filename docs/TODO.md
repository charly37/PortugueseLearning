# TODO List

## Implement TTL Index for Challenge Attempts Cleanup

To prevent unbounded growth of the `challengeattempts` collection, implement MongoDB TTL (Time To Live) indexing:

**Why:** Without cleanup, the `challengeattempts` collection will grow indefinitely as users practice challenges.

**Solution:** Create a TTL index to automatically delete attempts older than 90 days:

```javascript
// Run once in MongoDB shell or via Node.js startup script
db.challengeattempts.createIndex(
  { "attemptedAt": 1 },
  { expireAfterSeconds: 7776000 }  // 90 days = 7,776,000 seconds
)
```

**Implementation options:**
1. Add to a database initialization script
2. Run manually via MongoDB shell
3. Add to Node.js server startup (check if index exists, create if not)

**Benefits:**
- Automatic cleanup (no maintenance needed)
- Keeps 90 days of data (sufficient for weakness analysis in [`analytics/`](../analytics/))
- Bounded storage growth
- No impact on user documents (they stay small)

## Optimize Usefulness Vote Fetching - Batch API Calls

**Current issue:** Each `WordUsefulnessVote` component makes a separate `/api/challenge/get-votes` call when rendered, resulting in N database queries for N challenges (e.g., 20 queries for a 20-question challenge).

**Solution:** Batch-fetch all votes upfront when challenge set is generated:

1. **Modify challenge pages** (ChallengePage, FlashcardLearnPage, VerbChallengePage, IdiomChallengePage):
   - After generating challenges, extract all `challengeIds`
   - Make single `/api/challenge/get-votes` call with full array
   - Store results in component state: `const [userVotes, setUserVotes] = useState<{[key: string]: number}>({})`

2. **Update WordUsefulnessVote component**:
   - Add optional `userVote` prop to accept pre-fetched vote
   - Add optional `skipFetch` prop to disable useEffect API call
   - Use `userVote ?? currentUsefulness` for display

**Benefits:**
- Reduces 20 database queries → 1 batch query per challenge session
- Significant reduction in database traffic and API calls
- Faster page load (parallel fetch with challenge generation)
- Backend already supports batch queries via `challengeIds` array

**Priority:** Medium (performance optimization, not critical but noticeable at scale)
