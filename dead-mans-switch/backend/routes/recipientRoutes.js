const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireSwitchOwnership } = require("../middleware/errorHandler");
const {
  addRecipient,
  listRecipients,
  verifyRecipient,
  deleteRecipient,
} = require("../controllers/recipientController");

const router = express.Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireSwitchOwnership);

router.post("/", addRecipient);
router.get("/", listRecipients);
router.post("/verify", verifyRecipient);
router.delete("/:recipientId", deleteRecipient);

module.exports = router;
