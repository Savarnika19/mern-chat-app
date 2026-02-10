// Simple TextRank Implementation for Summarization
// Breaks text into sentences, calculates similarity, and ranks them.

const stopWords = new Set([
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "as", "at",
    "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
    "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from", "further",
    "had", "has", "have", "having", "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's",
    "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "it", "it's", "its", "itself",
    "let's", "me", "more", "most", "my", "myself", "nor", "of", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own",
    "same", "she", "she'd", "she'll", "she's", "should", "so", "some", "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there", "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", "those", "through", "to", "too",
    "under", "until", "up", "very", "was", "we", "we'd", "we'll", "we're", "we've", "were", "what", "what's", "when", "when's", "where", "where's", "which", "while", "who", "who's", "whom", "why", "why's", "with", "would",
    "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves"
]);

function getSentences(text) {
    // Split by . ? ! followed by space or end of string
    return text.match(/[^\.!\?]+[\.!\?]+/g) || [text];
}

function tokenize(sentence) {
    return sentence.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w && !stopWords.has(w));
}

function calculateSimilarity(sent1, sent2) {
    const words1 = tokenize(sent1);
    const words2 = tokenize(sent2);

    if (words1.length === 0 || words2.length === 0) return 0;

    const set1 = new Set(words1);
    const set2 = new Set(words2);

    let intersection = 0;
    for (let w of set1) {
        if (set2.has(w)) intersection++;
    }

    // Normalize by log length (TextRank formula equivalent variation)
    return intersection / (Math.log(words1.length) + Math.log(words2.length) + 1e-10);
}

function summarize(text, numSentences = 3) {
    const sentences = getSentences(text);
    if (sentences.length <= numSentences) return text;

    const n = sentences.length;
    const graph = Array(n).fill(0).map(() => Array(n).fill(0));

    // Build similarity graph
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (i !== j) {
                graph[i][j] = calculateSimilarity(sentences[i], sentences[j]);
            }
        }
    }

    // Calculate scores (PageRank-like)
    const scores = Array(n).fill(1);
    const d = 0.85; // Damping factor

    // Iterate to converge (simplified fixed iterations)
    for (let iter = 0; iter < 10; iter++) {
        const newScores = [...scores];
        for (let i = 0; i < n; i++) {
            let sum = 0;
            for (let j = 0; j < n; j++) {
                if (i !== j && graph[j][i] > 0) {
                    let sumOut = 0;
                    for (let k = 0; k < n; k++) sumOut += graph[j][k];
                    sum += (graph[j][i] / (sumOut + 1e-10)) * scores[j];
                }
            }
            newScores[i] = (1 - d) + d * sum;
        }
        scores.splice(0, n, ...newScores);
    }

    // Sort sentences by score
    const rankedSentences = sentences.map((sent, i) => ({ sent, score: scores[i], index: i }));
    rankedSentences.sort((a, b) => b.score - a.score);

    // Get top N
    const topSentences = rankedSentences.slice(0, numSentences);

    // Sort back by original index to preserve flow
    topSentences.sort((a, b) => a.index - b.index);

    return topSentences.map(item => item.sent.trim()).join(" ");
}

module.exports = { summarize };
