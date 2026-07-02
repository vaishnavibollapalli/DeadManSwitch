const express = require("express");
const { submitConfirmation } = require("../controllers/witnessController");

const router = express.Router();

router.post("/:conditionId/confirm", submitConfirmation);

module.exports = router;
