require("dotenv").config({ path: "backend/.env" });
const { summarize } = require("./services/geminiSummarizer");
const fs = require('fs');

const logFile = 'backend/test_results.log';
const log = (msg) => {
    console.log(msg);
    try { fs.appendFileSync(logFile, msg + '\n'); } catch (e) { }
};

// Mock Message Object
const msg = (name, content) => ({ sender: { name }, content });

const runTest = async () => {
    try { fs.writeFileSync(logFile, "Testing PRODUCTION Gemini Aggregator...\n"); } catch (e) { }

    if (!process.env.GEMINI_API_KEY) {
        log("ERROR: GEMINI_API_KEY is missing from process.env");
    } else {
        log("GEMINI_API_KEY is present.");
    }

    const conversation = [
        msg("Alex", "Team, prototype deadline is this Friday 5pm."),
        msg("Ravi", "I'll handle backend API."),
        msg("Sarah", "I'll handle the frontend."),
        msg("System", "Lorem ipsum ".repeat(50)), // Filler to test chunking boundary
        msg("Alex", "Deployment is set for Sunday night."),
        msg("Mike", "I'll monitor the logs."),
        msg("Ravi", "Also, cost limit is $500.")
    ];

    // Test 1: Standard Flow
    try {
        log("--- Test 1: Standard Conversation ---");
        const summary = await summarize(conversation, "test-chat-id-1");
        log("Summary Result: " + summary);

        // Validation
        if (!summary.includes("Friday")) log("FAILED: Missing deadline");
        else log("SUCCESS: Deadline found");

        if (!summary.includes("Sunday")) log("FAILED: Missing deployment");
        else log("SUCCESS: Deployment found");
    } catch (e) {
        log("Test 1 Failed: " + e.message);
    }

    // Test 2: Rate Limit (Immediate Retry)
    try {
        log("\n--- Test 2: Rate Limit Safeguard ---");
        // Should fail because same chat ID < 1 min
        await summarize(conversation, "test-chat-id-1");
    } catch (e) {
        if (e.message.includes("429")) log("SUCCESS: Rate limit triggered correctly.");
        else log("FAILED: Unexpected error: " + e.message);
    }

    // Test 3: Oversized (Simulated)
    try {
        log("\n--- Test 3: Oversized Input Guard ---");
        const hugeConv = Array(1000).fill(msg("Bot", "A".repeat(100))); // ~100k chars
        await summarize(hugeConv, "test-chat-id-3");
    } catch (e) {
        if (e.message.includes("Max 60k")) log("SUCCESS: Input size guard triggered.");
        else log("FAILED: Oversized check missed: " + e.message);
    }
};

runTest();
