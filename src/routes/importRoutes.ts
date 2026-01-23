import express from "express";
import multer from "multer";
import { importData } from "../controllers/importController";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/:type", upload.single("file"), importData);

// Advanced Import
import { validate, commit } from "../controllers/advancedImportController";
router.post("/advanced/validate", validate);
router.post("/advanced/commit", commit);

export default router;
