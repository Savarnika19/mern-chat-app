const chrono = require("chrono-node");
const { normalizeDateText } = require("./DateNormalizer");
const Deadline = require("../../models/deadlineModel");
const User = require("../../models/userModel");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Init Gemini (conditional)
let model = null;
if (process.env.GEMINI_API_KEY) {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    } catch (e) {
        console.error("Gemini Init Error in TaskExtraction:", e.message);
    }
}

// Triggers
const STRONG_TRIGGERS = ["submit", "complete", "finish", "deploy", "ivvali", "cheyali", "cheyyali", "upload", "send"];
const SOFT_TRIGGERS = ["please", "expected to", "kindly", "remember to"];
const URGENCY_KW = ["urgent", "asap", "immediately", "priority"];

// Service
const TaskExtractionService = {

    /**
     * Main Entry Point
     */
    extractAndSave: async (message, chatId, user) => {
        try {
            if (!message || !message.content || !chatId) return;

            // 1. Simple Segmentation
            const segments = splitSegments(message.content);

            for (const segment of segments) {
                // 2. Trigger Check
                const { isCandidate, triggerType } = checkTrigger(segment);
                if (!isCandidate) continue;

                // 3. Date Parsing
                const { date, normalizedText } = parseDate(segment);

                // 4. Urgency Check
                const isUrgentKW = URGENCY_KW.some(kw => segment.toLowerCase().includes(kw));

                // 5. Logic Branch
                let finalDate = date;
                let finalPriority = "normal";
                let isAi = false;
                let finalTitle = segment; // Start with raw segment as title

                if (date) {
                    // Rule: Date found
                    const hoursDiff = (date - new Date()) / (1000 * 60 * 60);
                    finalPriority = hoursDiff <= 24 ? "high" : "normal";
                } else if (isUrgentKW) {
                    // Rule: Urgent Keyword + No Date
                    finalPriority = "urgent";
                    finalDate = null; // Intentional null
                } else if (triggerType === 'strong' && getWordCount(segment) > 5 && model) {
                    // Rule: Strong Trigger + Complex + No Date + No Urgency -> Gemini Fallback
                    const geminiResult = await geminiFallback(segment);
                    if (geminiResult && geminiResult.task) {
                        finalTitle = geminiResult.task; // Use AI extracted title
                        finalDate = geminiResult.dueDate ? new Date(geminiResult.dueDate) : null;
                        if (isNaN(finalDate)) finalDate = null; // Safety
                        isAi = true;
                    } else {
                        continue; // Gemini failed or rejected -> Ignore
                    }
                } else {
                    continue; // Soft trigger with no date -> Ignore
                }

                // Clean Title (if not AI)
                if (!isAi) {
                    finalTitle = cleanTitle(segment, normalizedText);
                }

                // 6. Responsibility
                const assignedTo = await extractResponsibility(segment, message.sender, chatId);

                // 7. Deduplication & Save
                await saveTask({
                    title: finalTitle.substring(0, 150), // Safety limit
                    dueAt: finalDate,
                    priority: finalPriority,
                    assignedTo: assignedTo,
                    chat: chatId,
                    message: message._id,
                    createdBy: message.sender,
                    originalText: segment,
                    isAiGenerated: isAi
                });
            }

        } catch (error) {
            console.error("TaskExtractionService Error:", error.message);
            // Non-blocking: We catch errors so chat flow is not interrupted
        }
    }
};

// --- Helpers ---

const splitSegments = (text) => {
    // Split on . ; ? ! " and " " mariyu "
    // Regex matches the separators themselves or surrounding
    return text.split(/[\.;\?!]|\s+and\s+|\s+mariyu\s+/i)
        .map(s => s.trim())
        .filter(s => s.length > 0);
};

const checkTrigger = (text) => {
    const lower = text.toLowerCase();
    const strong = STRONG_TRIGGERS.some(t => lower.includes(t));
    if (strong) return { isCandidate: true, triggerType: 'strong' };

    const soft = SOFT_TRIGGERS.some(t => lower.includes(t));
    if (soft) return { isCandidate: true, triggerType: 'soft' };

    return { isCandidate: false, triggerType: 'none' };
};

const parseDate = (text) => {
    const normalized = normalizeDateText(text);
    const results = chrono.parse(normalized);
    if (results && results.length > 0) {
        return {
            date: results[0].start.date(),
            normalizedText: results[0].text // The text chrono actually used
        };
    }
    return { date: null, normalizedText: "" };
};

const cleanTitle = (rawSegment, dateText) => {
    let title = rawSegment;
    if (dateText) {
        // Remove the date part loosely to clean up title
        title = title.replace(new RegExp(escapeRegExp(dateText), 'i'), "");
    }
    // Remove triggers roughly
    [...STRONG_TRIGGERS, ...SOFT_TRIGGERS, ...URGENCY_KW].forEach(w => {
        title = title.replace(new RegExp(`\\b${w}\\b`, 'gi'), "");
    });
    return title.replace(/\s+/g, " ").trim();
};

const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getWordCount = (str) => str.trim().split(/\s+/).length;

const extractResponsibility = async (segment, senderId, chatId) => {
    const lower = segment.toLowerCase();

    // 1. @Mention logic would go here if we had full message entities. 
    // Simplified: Check if "I" or "Nenu" starts the sentence
    if (lower.startsWith("i ") || lower.startsWith("nenu ") || lower.startsWith("naaku ")) {
        return senderId;
    }

    // 2. "Name will..." pattern
    const match = segment.match(/([a-zA-Z]+)\s+will/i);
    if (match && match[1]) {
        const nameCandidate = match[1];
        // Ensure not a keyword
        if (["i", "you", "we", "he", "she", "it", "they"].includes(nameCandidate.toLowerCase())) return null;

        // DB Lookup (Simple name match in chat users)
        // Note: This is expensive if chat is huge, but project scope is fine.
        // Needs Chat model population. We will do a direct User search if needed or skip.
        // For efficiency in this project scope, we skip DB lookup here for "Name will" 
        // unless we want to do a specific User.findOne({ name: ... }) which is risky for common names.
        // Let's rely on exact matches if we had efficient user list. 
        // For simplicity: If we find a user with this name in the DB, assign. 
        // Risk: False positive on "Hope will..." -> User "Hope". Acceptable for prototype.

        try {
            const user = await User.findOne({ name: new RegExp(`^${nameCandidate}$`, 'i') }).select("_id");
            if (user) return user._id;
        } catch (e) { }
    }

    return null;
};

const geminiFallback = async (segment) => {
    if (!model) return null;
    try {
        const prompt = `
        Extract task from: "${segment}"
        Return JSON: {"task": "summary", "dueDate": "YYYY-MM-DD HH:mm" or null}
        Strict JSON only. No markdown.
        `;

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 100 }
        });

        const txt = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
        const json = JSON.parse(txt);

        if (json.task) return json;
    } catch (e) {
        // Fallback failed implies ignore
    }
    return null;
};

const saveTask = async (taskData) => {
    // Deduplication Key: Chat + Normalized Title + Date
    const normTitle = taskData.title.trim().toLowerCase().replace(/\s+/g, ' ');

    // Date match tolerance (ignore seconds/ms) if date exists
    let dateQuery = {};
    if (taskData.dueAt) {
        const start = new Date(taskData.dueAt); start.setSeconds(0, 0);
        const end = new Date(taskData.dueAt); end.setSeconds(59, 999);
        dateQuery = { dueAt: { $gte: start, $lte: end } };
    } else {
        dateQuery = { dueAt: null }; // Urgent tasks
    }

    const exists = await Deadline.findOne({
        chat: taskData.chat,
        // We compare normalizedText stored in 'originalText' roughly or use fuzzy?
        // Let's use exact normTitle match check if we stored normTitle? No we store raw.
        // So we compare fuzzy on title or just assume recent check?
        // Plan said: normalized_text. We don't store normalized text in schema separate.
        // Re-checking implementation plan: "Check DB for existing task... created within last 5 mins" was removed.
        // "Exact Semantic Match": We need to query.

        // Fix: We don't have a 'normalizedTitle' field. We will use the 'title' field for dedupe.
        // To be safe, we check if a task with SAME title (case insensitive) exists in this chat 
        // with same DueDate.
        title: new RegExp(`^${escapeRegExp(normTitle)}$`, 'i'),
        ...dateQuery
    });

    if (!exists) {
        await Deadline.create(taskData);
        console.log("Task Created:", taskData.title, taskData.priority);
    } else {
        console.log("Duplicate Task Ignored:", normTitle);
    }
};

module.exports = TaskExtractionService;
