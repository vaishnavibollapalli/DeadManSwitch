const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireSwitchOwnership } = require("../middleware/errorHandler");
const {
  addChannel,
  listChannels,
  deleteChannel,
} = require("../controllers/releaseChannelController");

const router = express.Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireSwitchOwnership);

router.post("/", addChannel);
router.get("/", listChannels);
router.delete("/:channelId", deleteChannel);

module.exports = router;
