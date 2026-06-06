/**
 * POST /api/upload/docx
 * Accepts a .docx file upload and returns the extracted plain text.
 * No authentication required (public endpoint, used by the partner submission form).
 */
import { Router } from "express";
import multer from "multer";
import mammoth from "mammoth";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith(".docx")) {
      cb(null, true);
    } else {
      cb(new Error("Only .docx files are accepted"));
    }
  },
});

export function registerDocxUploadRoute(app: Router) {
  app.post(
    "/api/upload/docx",
    upload.single("file"),
    async (req, res) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: "No file uploaded" });
          return;
        }
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        const text = result.value.trim();
        if (!text) {
          res.status(422).json({ error: "Could not extract text from the uploaded document" });
          return;
        }
        res.json({ text, warnings: result.messages.map((m) => m.message) });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(500).json({ error: message });
      }
    }
  );
}
