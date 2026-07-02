const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireSwitchOwnership } = require("../middleware/errorHandler");
const {
  addCondition,
  listConditions,
  updateCondition,
  deleteCondition,
} = require("../controllers/triggerConditionController");

const router = express.Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireSwitchOwnership);

router.post("/", addCondition);
router.get("/", listConditions);
router.patch("/:conditionId", updateCondition);
router.delete("/:conditionId", deleteCondition);

module.exports = router;
