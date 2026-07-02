const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { draftHandoffMessage } = require("../controllers/aiExecutorController");

const router = express.Router();

router.use(requireAuth);
router.post("/draft", draftHandoffMessage);

module.exports = router;
