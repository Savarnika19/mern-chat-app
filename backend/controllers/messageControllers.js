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

    // --- Auto-detect Deadline Logic ---
    try {
      // 1. Keyword & Length Check
      const lowerContent = content.toLowerCase();
      const singleWordRegex = /\b(deadline|due|submit|submission)\b/i;
      const hasKeywords =
        singleWordRegex.test(content) ||
        lowerContent.includes("last date") ||
        lowerContent.includes("complete by") ||
        lowerContent.includes("on or before");

      if (hasKeywords && content.length >= 8) {
        // 2. Parse Date
        const parsedResults = chrono.parse(content);

        if (parsedResults && parsedResults.length > 0) {
          const parsedDate = parsedResults[0].start.date();
          const parsedText = parsedResults[0].text;

          // 3. Duplicate Prevention - Rule A: Message ID
          const existingDeadline = await Deadline.findOne({ message: message._id });

          if (!existingDeadline) {
            // Rule B: Spam Prevention (Chat + Time + Title)
            // Check if a similar deadline exists in this chat around the same time
            const fiveMins = 5 * 60 * 1000;
            const spamCheck = await Deadline.findOne({
              chat: chatId,
              dueAt: {
                $gte: new Date(parsedDate.getTime() - fiveMins),
                $lte: new Date(parsedDate.getTime() + fiveMins)
              }
            });

            // Simple Title Extraction
            // Remove parsed date text and keywords
            let title = content.replace(parsedText, "");
            title = title.replace(singleWordRegex, "");
            title = title.replace(/last date|complete by|on or before/gi, "");
            title = title.replace(/\s+/g, " ").trim();

            // If title matches spam check title (rough check)
            let isSpam = false;
            if (spamCheck) {
              // If the extracted title is very similar to existing one, assume spam
              if (spamCheck.title === title || (title.length < 5 && spamCheck.title.includes(title))) {
                isSpam = true;
              }
            }

            if (!title) title = "Deadline";

            if (!isSpam) {
              await Deadline.create({
                title: title,
                dueAt: parsedDate,
                chat: chatId,
                message: message._id,
                createdBy: req.user._id,
                status: "pending",
                extractedFrom: content,
              });
            }
          }
        }
      }
    } catch (deadlineError) {
      console.error("Failed to auto-detect deadline:", deadlineError);
      // Do not block message sending
    }
    // ----------------------------------

    res.json(message);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

const { summarize } = require("../config/TextRank");

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

  // Join with punctuations to ensure sentence detection works
  const fullText = messages.map((m) => {
    let content = m.content.trim();
    if (!/[.!?]$/.test(content)) content += ".";
    return content;
  }).join(" ");

  // If text is too short, just return it
  if (fullText.length < 50) {
    return res.json({ summary: fullText });
  }

  try {
    const summaryText = summarize(fullText, 3); // Get top 3 sentences
    res.json({ summary: summaryText });
  } catch (err) {
    console.error("Summarization error:", err);
    res.json({ summary: fullText.substring(0, 300) + "..." });
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
