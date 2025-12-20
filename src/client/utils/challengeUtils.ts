// Utility functions for challenge submission

/**
 * Normalize a string by removing accents/diacritics for flexible comparison
 * Example: "lâmpada" becomes "lampada"
 */
export const normalizeString = (str: string): string => {
  return str
    .normalize('NFD') // Decompose characters with diacritics
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
    .toLowerCase()
    .trim();
};

export const submitChallengeAttempt = async (
  challengeId: string,
  challengeType: 'word' | 'idiom' | 'verb',
  correct: boolean,
  userAnswer: string,
  correctAnswer: string,
  timeSpent?: number
): Promise<{ success: boolean; data?: any; error?: string }> => {
  try {
    const response = await fetch('/api/challenge/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        challengeId,
        challengeType,
        correct,
        userAnswer,
        correctAnswer,
        timeSpent,
      }),
    });

    if (!response.ok) {
      // If not authenticated, that's ok - just don't track
      if (response.status === 401) {
        return { success: false, error: 'Not authenticated' };
      }
      throw new Error('Failed to submit challenge attempt');
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error submitting challenge attempt:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};

export const checkAuthentication = async (): Promise<{
  authenticated: boolean;
  user?: any;
}> => {
  try {
    const response = await fetch('/api/auth/check-auth', {
      credentials: 'include',
    });

    if (!response.ok) {
      return { authenticated: false };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error checking authentication:', error);
    return { authenticated: false };
  }
};
