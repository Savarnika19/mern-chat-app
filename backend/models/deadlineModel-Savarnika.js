const mongoose = require("mongoose");

const deadlineSchema = mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
            default: "Deadline",
        },
        dueAt: {
            type: Date,
            // required: true, // Made optional for "Urgent" tasks without specific date
        },
        priority: {
            type: String,
            enum: ["normal", "high", "urgent"],
            default: "normal",
        },
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        chat: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Chat",
            required: true,
        },
        message: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Message",
            required: true,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        status: {
            type: String,
            enum: ["pending", "completed"],
            default: "pending",
        },
        isAiGenerated: {
            type: Boolean,
            default: false,
        },
        originalText: {
            type: String,
            required: true, // Mandatory for traceability
            trim: true,
        },
        extractedFrom: { // Keep for backward compatibility/reference
            type: String,
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

const Deadline = mongoose.model("Deadline", deadlineSchema);

module.exports = Deadline;
