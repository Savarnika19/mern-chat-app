const asyncHandler = require("express-async-handler");
const Message = require("../models/messageModel");
const User = require("../models/userModel");
const Chat = require("../models/chatModel");
const Deadline = require("../models/deadlineModel");
const chrono = require("chrono-node");

//@description     Get all Messages
//@route           GET /api/Message/:chatId
//@access          Protected
const allMessages = asyncHandler(async (req, res) => {
  try {
    const messages = await Message.find({
      chat: req.params.chatId,
      deletedBy: { $nin: [req.user._id] }
    })
      .populate("sender", "name pic email")
      .populate("chat");
    res.json(messages);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

//@description     Create New Message
//@route           POST /api/Message/
//@access          Protected
const sendMessage = asyncHandler(async (req, res) => {
  const { content, chatId } = req.body;

  if (!content || !chatId) {
    console.log("Invalid data passed into request");
    return res.sendStatus(400);
  }

  var newMessage = {
    sender: req.user._id,
    content: content,
    chat: chatId,
  };

  try {
    var message = await Message.create(newMessage);

    message = await message.populate("sender", "name pic");
    message = await message.populate("chat");
    message = await User.populate(message, {
      path: "chat.users",
      select: "name pic email",
    });

    await Chat.findByIdAndUpdate(req.body.chatId, { latestMessage: message });

    // --- Auto-detect Deadline Logic (New Modular Service) ---
    try {
      const TaskExtractionService = require("../services/taskExtraction/TaskExtractionService");
      // Execute asynchronously - do not await to block response if not critical
      // But user wanted "Await database writes" in requirements.
      // So we better await it or ensure it is reliable.
      // Requirement 8: "Extraction must: Await database writes"
      await TaskExtractionService.extractAndSave(message, chatId, req.user._id);
    } catch (deadlineError) {
      console.error("Failed to auto-detect deadline:", deadlineError.message);
      // Do not block message sending
    }
    // ----------------------------------

    res.json(message);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

const { summarize } = require("../services/geminiSummarizer");

const summarizeMessages = asyncHandler(async (req, res) => {
  const { chatId, messageIds } = req.body;
  let messages = [];

  if (chatId) {
    // Unread messages: those NOT read by current user
    messages = await Message.find({
      chat: chatId,
      readBy: { $ne: req.user._id },
    });
  } else if (messageIds && messageIds.length > 0) {
    messages = await Message.find({
      _id: { $in: messageIds },
    });
  }

  if (!messages || messages.length === 0) {
    return res.status(400);
    throw new Error("No messages found to summarize");
  }

  try {
    // Pass strict array of message objects to support the new Map-Reduce architecture
    // Also pass chatId for rate limiting
    const summaryText = await summarize(messages, chatId);
    res.json({ summary: summaryText });
  } catch (err) {
    console.error("Summarization error:", err);
    // Handle 429 and 413 specific errors
    if (err.message.includes("429")) {
      return res.status(429).json({ summary: "Too many summary requests. Please wait a minute." });
    }
    if (err.message.includes("413") || err.message.includes("Input too large")) {
      return res.status(413).json({ summary: "Conversation too large to summarize (>60k chars)." });
    }
    res.json({ summary: "Failed to generate summary." });
  }

});

const deleteMessages = asyncHandler(async (req, res) => {
  const { messageIds } = req.body;

  if (!messageIds || messageIds.length === 0) {
    return res.status(400);
    throw new Error("No message IDs provided");
  }

  // Soft Delete: Add user to deletedBy array
  const result = await Message.updateMany(
    { _id: { $in: messageIds } },
    { $addToSet: { deletedBy: req.user._id } }
  );

  if (result.nModified > 0 || result.acknowledged) { // nModified or acknowledged check
    res.json({ message: "Messages deleted", deletedCount: result.nModified || messageIds.length });
  } else {
    res.status(404);
    throw new Error("No messages found to delete");
  }
});

module.exports = { allMessages, sendMessage, summarizeMessages, deleteMessages };
