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
            required: true,
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
        extractedFrom: {
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
