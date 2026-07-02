const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { getProgress, markStep } = require("../controllers/onboardingController");

const router = express.Router();

router.use(requireAuth);
router.get("/", getProgress);
router.post("/step", markStep);

module.exports = router;
