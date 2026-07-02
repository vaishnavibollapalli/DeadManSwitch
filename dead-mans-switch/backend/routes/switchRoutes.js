const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireSwitchOwnership } = require("../middleware/errorHandler");
const {
  createSwitch,
  listSwitches,
  getSwitch,
  updateSwitch,
  checkIn,
  getAuditTrail,
} = require("../controllers/switchController");

const router = express.Router();

router.use(requireAuth);

router.post("/", createSwitch);
router.get("/", listSwitches);
router.get("/:switchId", requireSwitchOwnership, getSwitch);
router.patch("/:switchId", requireSwitchOwnership, updateSwitch);
router.post("/:switchId/checkin", requireSwitchOwnership, checkIn);
router.get("/:switchId/audit", requireSwitchOwnership, getAuditTrail);

module.exports = router;
