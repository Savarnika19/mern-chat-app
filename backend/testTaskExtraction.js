require("dotenv").config({ path: "backend/.env" });
const mongoose = require("mongoose");
const TaskExtractionService = require("./services/taskExtraction/TaskExtractionService");
const Deadline = require("./models/deadlineModel");
const User = require("./models/userModel");
const Chat = require("./models/chatModel");

const runTest = async () => {
    console.log("--- Starting Task Extraction Test ---");

    // 1. Connect DB
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("DB Connected");
    } catch (e) {
        console.error("DB Connection Failed:", e);
        return;
    }

    // 2. Setup Dummy Data
    const dummyUserId = new mongoose.Types.ObjectId(); // Random ID
    const dummyChatId = new mongoose.Types.ObjectId(); // Random ID

    // Mock Message Helper
    const createMsg = (content) => ({
        _id: new mongoose.Types.ObjectId(),
        content: content,
        sender: dummyUserId, // "I" will match this
        chat: dummyChatId
    });

    try {
        // --- Test 1: Multilingual Date (Telugu) ---
        console.log("\n[Test 1] Telugu Date: 'Repu submit cheyali'");
        await TaskExtractionService.extractAndSave(createMsg("Repu submit cheyali"), dummyChatId, dummyUserId);

        const t1 = await Deadline.findOne({ chat: dummyChatId, originalText: "Repu submit cheyali" });
        if (t1 && t1.dueAt) {
            const hours = (t1.dueAt - new Date()) / 36e5;
            console.log(`PASS: Task created. Due in ~${hours.toFixed(1)} hours. Priority: ${t1.priority}`);
        } else {
            console.log("FAIL: Task not created or date missing.");
        }

        // --- Test 2: Phrase Normalization ---
        console.log("\n[Test 2] Phrase: 'Submit repo ellundi madyanam'");
        await TaskExtractionService.extractAndSave(createMsg("Submit repo ellundi madyanam"), dummyChatId, dummyUserId);

        const t2 = await Deadline.findOne({ chat: dummyChatId, originalText: "Submit repo ellundi madyanam" });
        if (t2 && t2.dueAt) {
            console.log(`PASS: Task created. DueAt: ${t2.dueAt.toISOString()}.`);
        } else {
            console.log("FAIL: Task not created.");
        }

        // --- Test 3: Urgency (No Date) ---
        console.log("\n[Test 3] Urgency: 'This is urgent priority'");
        await TaskExtractionService.extractAndSave(createMsg("This is urgent priority"), dummyChatId, dummyUserId);

        const t3 = await Deadline.findOne({ chat: dummyChatId, originalText: "This is urgent priority" });
        if (t3 && t3.priority === 'urgent' && t3.dueAt === undefined) { // Check handling of null dueAt
            console.log("PASS: Urgent task created with NULL date.");
        } else if (t3 && t3.priority === 'urgent') {
            console.log("PASS: Priority is Urgent.");
        } else {
            console.log("FAIL: Urgency detection failed.");
        }

        // --- Test 4: Gemini Fallback (Strict Condition) ---
        // Needs strong trigger + >5 words + no date + no urgency
        console.log("\n[Test 4] Gemini Fallback: 'Please ensure you complete the system deployment documentation properly'");
        await TaskExtractionService.extractAndSave(createMsg("Please ensure you complete the system deployment documentation properly"), dummyChatId, dummyUserId);

        // Wait for async (Gemini might take time) - Service awaits it, so it should be done.
        const t4 = await Deadline.findOne({ chat: dummyChatId, originalText: /deployment documentation/ });
        if (t4) {
            console.log(`PASS: Gemini Extracted Task. AI Generated: ${t4.isAiGenerated}`);
            console.log(`Title: ${t4.title}`);
        } else {
            console.log("WARN: Gemini Fallback might have failed or quota exceeded (or not triggered).");
        }

        // --- Test 5: Deduplication ---
        console.log("\n[Test 5] Deduplication");
        await TaskExtractionService.extractAndSave(createMsg("Repu submit cheyali"), dummyChatId, dummyUserId);
        const count = await Deadline.countDocuments({ chat: dummyChatId, originalText: "Repu submit cheyali" });
        if (count === 1) {
            console.log("PASS: Duplicate ignored. Count is 1.");
        } else {
            console.log(`FAIL: Duplicates found. Count: ${count}`);
        }

    } catch (e) {
        console.error("Test Error:", e);
    } finally {
        // Cleanup
        console.log("\nCleaning up test data...");
        await Deadline.deleteMany({ chat: dummyChatId });
        await mongoose.connection.close();
        console.log("Done.");
    }
};

runTest();
