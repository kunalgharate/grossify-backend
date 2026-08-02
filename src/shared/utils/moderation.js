/**
 * Basic profanity filter for review moderation
 * In production, replace with a proper NLP-based moderation service
 */

const BLOCKED_WORDS = [
  'scam', 'fraud', 'cheat', 'fake', 'spam', 'abuse',
  // Add more words as needed — keeping this minimal for now
];

/**
 * Check if text contains profanity or blocked content
 * @returns {object} { clean: boolean, flaggedWords: string[] }
 */
const moderateText = (text) => {
  if (!text) return { clean: true, flaggedWords: [] };

  const lower = text.toLowerCase();
  const flaggedWords = BLOCKED_WORDS.filter(word => lower.includes(word));

  return {
    clean: flaggedWords.length === 0,
    flaggedWords,
  };
};

module.exports = { moderateText };
