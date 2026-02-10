const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
    getGlobalDeadlines,
    markCompleted,
    deleteDeadline,
} = require("../controllers/deadlineControllers");

const router = express.Router();

router.route("/").get(protect, getGlobalDeadlines);
router.route("/:id/complete").patch(protect, markCompleted);
router.route("/:id").delete(protect, deleteDeadline);

module.exports = router;
