const asyncHandler = require("express-async-handler");
const Deadline = require("../models/deadlineModel");
const Chat = require("../models/chatModel");

//@description     Get all Deadlines for the User (Global)
//@route           GET /api/deadlines
//@access          Protected
const getGlobalDeadlines = asyncHandler(async (req, res) => {
    const { status } = req.query;

    try {
        // 1. Get all chats the user is part of
        const chats = await Chat.find({
            users: { $elemMatch: { $eq: req.user._id } },
        });

        if (!chats) {
            return res.json({ pending: [], completed: [] });
        }

        const chatIds = chats.map((c) => c._id);

        // 2 Fetch all deadlines for these chats
        const query = { chat: { $in: chatIds } };

        const deadlines = await Deadline.find(query)
            .populate("chat", "chatName isGroupChat")
            .populate("message", "content")
            .populate("createdBy", "name pic")
            .sort({ dueAt: 1 });

        const pending = [];
        const completed = [];
        const currentUserId = req.user._id.toString();

        deadlines.forEach((d) => {
            // Filter: Exclude own created deadlines (Sender shouldn't see them)
            if (d.createdBy && d.createdBy._id.toString() === currentUserId) return;

            // Filter by requested status if provided
            if (status && d.status !== status) return;

            if (d.status === "completed") {
                completed.push(d);
            } else {
                pending.push(d);
            }
        });

        res.json({ pending, completed });

    } catch (error) {
        res.status(400);
        throw new Error(error.message);
    }
});

//@description     Mark Deadline as Completed
//@route           PATCH /api/deadlines/:id/complete
//@access          Protected
const markCompleted = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const deadline = await Deadline.findById(id);

    if (!deadline) {
        res.status(404);
        throw new Error("Deadline not found");
    }

    // Optional: Check if user is part of the chat (Already implicit via route protection + UI but valid backend check)
    // For MVP trusting they have access if they can hit the endpoint with valid ID (and it's a shared chat deadline)

    deadline.status = "completed";
    await deadline.save();

    res.json(deadline);
});

//@description     Delete Deadline
//@route           DELETE /api/deadlines/:id
//@access          Protected
const deleteDeadline = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const deadline = await Deadline.findById(id);

    if (!deadline) {
        res.status(404);
        throw new Error("Deadline not found");
    }

    await deadline.remove();

    res.json({ message: "Deadline Removed" });
});

module.exports = { getGlobalDeadlines, markCompleted, deleteDeadline };
