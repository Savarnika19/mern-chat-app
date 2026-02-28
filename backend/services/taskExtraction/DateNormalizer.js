/**
 * DateNormalizer.js
 * 
 * Purpose: Preprocessing layer to convert Telugu/Hinglish temporal words to English
 * before passing text to chrono-node.
 */

// Stage 1: Phrase-Level Map (Longest match first)
const PHRASE_MAP = [
    { from: "day after tomorrow", to: "day after tomorrow" }, // Keep English intact
    { from: "day after tmrw", to: "day after tomorrow" },
    { from: "ellundi madyanam", to: "day after tomorrow afternoon" },
    { from: "ellundi poddunna", to: "day after tomorrow morning" },
    { from: "ellundi sayantram", to: "day after tomorrow evening" },
    { from: "repu madyanam", to: "tomorrow afternoon" },
    { from: "repu poddunna", to: "tomorrow morning" },
    { from: "repu sayantram", to: "tomorrow evening" },
    { from: "next week lopala", to: "by next week" },
    { from: "vache varam", to: "next week" },
    { from: "ee varam", to: "this week" },
    { from: "ee roju", to: "today" },
];

// Stage 2: Word-Level Map
const WORD_MAP = {
    "repu": "tomorrow",
    "ellundi": "day after tomorrow",
    "ivala": "today",
    "ivvala": "today",
    "ninna": "yesterday",
    "madyanam": "afternoon",
    "poddunna": "morning",
    "udayam": "morning",
    "sayantram": "evening",
    "lopala": "by",
    "varam": "week",
    "gantala": "hours",
    "tarvata": "after",
    "appudu": "at",
};

/**
 * Normalizes text by replacing Telugu/Hinglish temporal phrases with English keys.
 * Strategy:
 * 1. Lowercase text.
 * 2. Replace known phrases (Stage 1).
 * 3. Replace isolated words (Stage 2).
 * 4. Return normalized text for Chrono parsing.
 * 
 * @param {string} text 
 * @returns {string}
 */
const normalizeDateText = (text) => {
    if (!text) return "";
    let normalized = text.toLowerCase();

    // Stage 1: Phrase Replacement
    PHRASE_MAP.forEach(phrase => {
        // Regex with word boundaries to avoid partial matches
        const regex = new RegExp(`\\b${phrase.from}\\b`, 'g');
        normalized = normalized.replace(regex, phrase.to);
    });

    // Stage 2: Word Replacement
    Object.keys(WORD_MAP).forEach(word => {
        // Only replace if it wasn't part of a handled phrase (simplistic but effective given order)
        // Check for word boundary
        const regex = new RegExp(`\\b${word}\\b`, 'g');
        normalized = normalized.replace(regex, WORD_MAP[word]);
    });

    return normalized;
};

module.exports = { normalizeDateText };
