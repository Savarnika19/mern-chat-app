const { GoogleGenerativeAI } = require("@google/generative-ai");
const { summarize: textRankSummarize } = require("../config/TextRank");

// NOTE: Backend restart required after modifying summarizer.

const apiKey = process.env.GEMINI_API_KEY;
let genAI = null;
let model = null;

if (apiKey) {
    try {
        genAI = new GoogleGenerativeAI(apiKey);
        model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    } catch (error) {
        console.error("Gemini initialization error:", error.message);
    }
} else {
    console.warn("GEMINI_API_KEY not found in environment variables. Defaulting to TextRank.");
}

// Global Throttling State
let globalRequestCount = 0;
const GLOBAL_RATE_LIMIT = 50; // requests per minute
const RATE_LIMIT_WINDOW = 60000; // 1 minute
setInterval(() => { globalRequestCount = 0; }, RATE_LIMIT_WINDOW);

// Per-Chat Cooldown State
const chatCooldowns = new Map();
const CHAT_COOLDOWN_MS = 60000; // 1 minute

// Cost Safeguard
let dailyTokenUsage = 0;
const DAILY_TOKEN_LIMIT = 4000000; // ~4M tokens ($2.00)
setInterval(() => { dailyTokenUsage = 0; }, 24 * 60 * 60 * 1000); // Reset daily

/**
 * Custom Concurrency Limiter
 */
const limit = (concurrency) => {
    const queue = [];
    let active = 0;
    const next = () => {
        if (queue.length && active < concurrency) {
            const { fn, resolve, reject } = queue.shift();
            active++;
            fn().then(resolve).catch(reject).finally(() => {
                active--;
                next();
            });
        }
    };
    return (fn) => new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject });
        next();
    });
};

const limiter = limit(5); // Concurrency 5

/**
 * Normalizes string for deduplication.
 */
const normalize = (str) => {
    if (!str) return "";
    return str.trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
};

/**
 * Clean JSON string from markdown and control chars.
 */
const cleanJSON = (raw) => {
    if (!raw) return "{}";
    let cleaned = raw.replace(/```json/g, "").replace(/```/g, "");
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1'); // Trailing commas
    return cleaned.trim();
};

/**
 * Chunks messages by character limit.
 */
const chunkMessages = (messages, limit = 3000) => {
    const chunks = [];
    let currentChunk = "";

    messages.forEach(msg => {
        const sender = msg.sender && msg.sender.name ? msg.sender.name : "User";
        const content = msg.content || "";
        const formatted = `[${sender}]: ${content}\n`;

        if (currentChunk.length + formatted.length > limit) {
            if (currentChunk.length > 0) chunks.push(currentChunk);
            currentChunk = formatted;
        } else {
            currentChunk += formatted;
        }
    });
    if (currentChunk.length > 0) chunks.push(currentChunk);

    // Safety check for massive single messages (rare but possible)
    return chunks.map(c => c.length > limit * 1.5 ? c.substring(0, limit * 1.5) : c);
};

/**
 * Retry wrapper
 */
const withRetry = async (fn, retries = 1, timeout = 6000) => {
    for (let i = 0; i <= retries; i++) {
        try {
            return await Promise.race([
                fn(),
                new Promise((_, r) => setTimeout(() => r(new Error("Timeout")), timeout))
            ]);
        } catch (err) {
            if (i === retries) throw err;
            // Only retry network/5xx/timeout
            if (!err.message.includes("Timeout") && !err.message.includes("fetch failed") && !err.response?.status?.toString().startsWith('5')) {
                // Check if it is the 404 to allow fallback logic higher up?
                // No, fallback logic is inside extraction function now.
                // If it throws here, it failed fallback too.
                throw err;
            }
            await new Promise(r => setTimeout(r, 1000)); // Backoff
        }
    }
};

/**
 * Extracts structured JSON from text chunk.
 */
const extractStructured = async (text) => {
    if (!model) throw new Error("Gemini not initialized");

    const prompt = `
You are an information extraction assistant.
Extract structured data from this chat segment into valid JSON.

Categories:
- deadlines (Include all dates, times, 'due by', 'submit by', etc.)
- responsibilities (Who is doing what? e.g., "I'll handle X", "User Y assigned to Z")
- financial_decisions (Costs, prices, budget limits, payments)
- deployment_decisions (Release schedules, server updates, "going live", "deploying")
- other_decisions (Any other important agreements or conclusions)

JSON Format:
{
  "deadlines": [],
  "responsibilities": [],
  "financial_decisions": [],
  "deployment_decisions": [],
  "other_decisions": []
}

Rules:
- Extract exact statements or clear summaries of the decision.
- Do NOT merge multiple items into one string.
- Return empty arrays if no info found for a category.
- Strict valid JSON only.

Chat Segment:
"""
${text}
"""
`;
    // Fallback Logic
    let currentModel = model;
    let fallbackTried = false;

    while (true) {
        try {
            dailyTokenUsage += text.length / 4;

            // Use getGenerativeModel on the fly to support switching if needed
            // But 'currentModel' is an object.

            const result = await currentModel.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 1000 },
            });

            const txt = result.response.text();

            dailyTokenUsage += txt.length / 4;

            const cleaned = cleanJSON(txt);
            return JSON.parse(cleaned);
        } catch (error) {
            if ((error.message.includes("404") || error.message.includes("not found")) && !fallbackTried) {
                console.warn("Gemini Flash failed (404). Falling back to gemini-pro.");
                try {
                    // CAUTION: 'genAI' must be available.
                    currentModel = genAI.getGenerativeModel({ model: "gemini-pro" });
                    model = currentModel; // Update global
                    fallbackTried = true;
                    continue;
                } catch (fallbackError) {
                    throw error;
                }
            }
            throw error;
        }
    }
};

/**
 * Merges multiple JSON objects into one using Gemini if needed (Recursive).
 */
const recursiveMerge = async (jsonList) => {
    if (jsonList.length === 0) return null;
    if (jsonList.length === 1) return jsonList[0];

    const jsonString = JSON.stringify(jsonList, null, 2);

    const prompt = `
Merge these multiple extracted JSON lists into a single consolidated JSON.
Preserve chronological order of the lists.
Deduplicate identical items semanticallly.
Return strict JSON with the same schema.

Input Lists:
${jsonString}
`;
    dailyTokenUsage += jsonString.length / 4;

    const result = await withRetry(async () => {
        return model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
        });
    }, 1, 8000); // 8s timeout for merge

    const txt = result.response.text();
    dailyTokenUsage += txt.length / 4;
    return JSON.parse(cleanJSON(txt));
};

/**
 * Main Summary Function
 */
const summarize = async (input, chatId = "unknown") => {
    // 0. Safeguards
    if (dailyTokenUsage > DAILY_TOKEN_LIMIT) {
        console.warn("Daily token limit exceeded. Falling back to TextRank.");
        return textRankFallback(input);
    }
    if (globalRequestCount >= GLOBAL_RATE_LIMIT) {
        throw new Error("Global rate limit exceeded (429)");
    }
    if (chatId && chatCooldowns.has(chatId)) {
        const last = chatCooldowns.get(chatId);
        if (Date.now() - last < CHAT_COOLDOWN_MS) throw new Error("Rate limit per chat exceeded (429)");
    }

    // Update Counters
    globalRequestCount++;
    if (chatId) chatCooldowns.set(chatId, Date.now());

    // 1. Normalization
    let messages = Array.isArray(input) ? input : [{ sender: { name: "User" }, content: input }];
    const totalChars = messages.reduce((acc, m) => acc + (m.content || "").length, 0);

    // 2. Strict Input Bound
    if (totalChars > 60000) {
        throw new Error("Input too large (Max 60k characters).");
    }

    // 3. Fallback to TextRank if no API key
    if (!model) return textRankFallback(messages);

    try {
        // Global Timeout Race
        const processPromise = (async () => {
            // 4. Chunking
            let chunks = chunkMessages(messages, 3000);

            // 5. Map Phase (Parallel Extraction)
            const extractionPromises = chunks.map(chunk =>
                limiter(() => withRetry(() => extractStructured(chunk), 1, 8000))
            );

            const results = await Promise.allSettled(extractionPromises);

            // Filter success
            let successfulJSONs = results
                .filter(r => r.status === 'fulfilled')
                .map(r => r.value);

            if (successfulJSONs.length === 0) {
                const errors = results.filter(r => r.status === 'rejected').map(r => r.reason.message);
                console.error("All chunks failed. Errors:", errors);
                throw new Error("All extractions failed: " + errors.join(", "));
            }

            // 6. Level 2 Recursive Merge (if needed)
            while (successfulJSONs.length > 5) {
                const nextLevel = [];
                for (let i = 0; i < successfulJSONs.length; i += 5) {
                    const batch = successfulJSONs.slice(i, i + 5);
                    try {
                        const merged = await recursiveMerge(batch);
                        if (merged) nextLevel.push(merged);
                    } catch (e) {
                        console.warn("Merge batch failed, keeping distinct items:", e.message);
                        nextLevel.push(simpleJSMerge(batch));
                    }
                }
                successfulJSONs = nextLevel;
            }

            // 7. Final Integration
            const validData = simpleJSMerge(successfulJSONs);

            // 8. Format
            const finalSummary = formatSummary(validData);
            return finalSummary || "No significant decisions found.";
        })();

        // Global 60s Timeout
        return await Promise.race([
            processPromise,
            new Promise((_, r) => setTimeout(() => r(new Error("Global Processing Timeout")), 60000))
        ]);

    } catch (error) {
        console.error("Gemini Aggregation Failed:", error.message);
        return textRankFallback(messages);
    }
};

/**
 * Validates and flattens a list of JSON objects into one using simple JS (Deterministic).
 */
const simpleJSMerge = (list) => {
    const master = {
        deadlines: [],
        responsibilities: [],
        financial_decisions: [],
        deployment_decisions: [],
        other_decisions: []
    };

    list.forEach(item => {
        if (!item) return;
        if (item.deadlines) master.deadlines.push(...item.deadlines);
        if (item.responsibilities) master.responsibilities.push(...item.responsibilities);
        if (item.financial_decisions) master.financial_decisions.push(...item.financial_decisions);
        if (item.deployment_decisions) master.deployment_decisions.push(...item.deployment_decisions);
        if (item.other_decisions) master.other_decisions.push(...item.other_decisions);
    });

    return master;
};

/**
 * Fallback Wrapper
 */
const textRankFallback = (messages) => {
    console.log("Using TextRank Fallback");
    const text = Array.isArray(messages)
        ? messages.map(m => m.content).join(" ")
        : messages;

    try {
        return textRankSummarize(text, 3);
    } catch (e) {
        return "Summary unavailable.";
    }
};

/**
 * Format Final Paragraph
 */
const formatSummary = (data) => {
    let parts = [];
    const seen = new Set();

    const addCategory = (items) => {
        if (items && Array.isArray(items) && items.length > 0) {
            const validItems = items
                .filter(i => typeof i === 'string' && i.trim().length > 0)
                .map(i => i.trim());

            const uniqueItems = [];
            validItems.forEach(i => {
                const key = normalize(i);
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueItems.push(i);
                }
            });

            if (uniqueItems.length > 0) {
                const text = uniqueItems.map(item => {
                    return /[.!?]$/.test(item) ? item : item + ".";
                }).join(" ");
                parts.push(text);
            }
        }
    };

    addCategory(data.deadlines);
    addCategory(data.responsibilities);
    addCategory(data.financial_decisions);
    addCategory(data.deployment_decisions);
    addCategory(data.other_decisions);

    return parts.join(" ");
};

module.exports = { summarize };
