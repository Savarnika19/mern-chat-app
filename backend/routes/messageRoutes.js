const express = require("express");
const {
  allMessages,
  sendMessage,
  summarizeMessages,
  deleteMessages,
} = require("../controllers/messageControllers");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.route("/:chatId").get(protect, allMessages);
router.route("/").post(protect, sendMessage);
router.route("/summarize").post(protect, summarizeMessages);
router.route("/delete").post(protect, deleteMessages);

module.exports = router;
