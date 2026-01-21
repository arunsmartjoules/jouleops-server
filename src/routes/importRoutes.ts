import express from "express";
import multer from "multer";
import { importData } from "../controllers/importController";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/:type", upload.single("file"), importData);

export default router;
