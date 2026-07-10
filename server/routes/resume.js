import express from 'express';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import protect from '../middleware/auth.js';
import User from '../models/User.js';
import { analyzeResume, extractTextFromImage } from '../services/groqService.js';

const router = express.Router();

// Configure multer — store files temporarily in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPEG, and PNG files are accepted'));
    }
  },
});

/**
 * POST /api/resume/upload
 * Upload a resume file (PDF or image), extract text, analyze it with AI,
 * and save structured data to the user's profile.
 */
router.post('/upload', protect, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { mimetype, buffer } = req.file;
    let rawText = '';

    // ── Step 1: Extract text from the file ──────────────
    if (mimetype === 'application/pdf') {
      // PDF → extract text with pdf-parse
      const parser = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      rawText = pdfData.text;
    } else {
      // Image (JPEG/PNG) → use Groq vision model for OCR
      const base64 = buffer.toString('base64');
      rawText = await extractTextFromImage(base64, mimetype);
    }

    if (!rawText || rawText.trim().length < 20) {
      return res.status(422).json({
        message: 'Could not extract enough text from the file. Please try a clearer image or a text-based PDF.',
      });
    }

    // ── Step 2: Analyze the resume with AI ──────────────
    const analysis = await analyzeResume(rawText);

    // ── Step 3: Save to user profile ────────────────────
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.resumeData = {
      rawText: rawText.slice(0, 5000), // cap storage
      name: analysis.name || null,
      detectedRole: analysis.detectedRole || null,
      skills: analysis.skills || [],
      experienceLevel: analysis.experienceLevel || null,
      projects: analysis.projects || [],
      summary: analysis.summary || null,
      uploadedAt: new Date(),
    };

    await user.save();

    res.status(200).json({
      message: 'Resume analyzed successfully',
      resumeData: {
        name: user.resumeData.name,
        detectedRole: user.resumeData.detectedRole,
        skills: user.resumeData.skills,
        experienceLevel: user.resumeData.experienceLevel,
        projects: user.resumeData.projects,
        summary: user.resumeData.summary,
      },
    });
  } catch (err) {
    console.error('Resume upload error:', err);
    res.status(500).json({ message: 'Failed to process resume' });
  }
});

/**
 * GET /api/resume
 * Return the authenticated user's saved resume data.
 */
router.get('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('resumeData');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.status(200).json({
      hasResume: !!user.resumeData?.uploadedAt,
      resumeData: user.resumeData?.uploadedAt
        ? {
            name: user.resumeData.name,
            detectedRole: user.resumeData.detectedRole,
            skills: user.resumeData.skills,
            experienceLevel: user.resumeData.experienceLevel,
            projects: user.resumeData.projects,
            summary: user.resumeData.summary,
            uploadedAt: user.resumeData.uploadedAt,
          }
        : null,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching resume data' });
  }
});

/**
 * DELETE /api/resume
 * Clear the user's saved resume data.
 */
router.delete('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.resumeData = undefined;
    await user.save();

    res.status(200).json({ message: 'Resume data cleared' });
  } catch (err) {
    res.status(500).json({ message: 'Error clearing resume data' });
  }
});

export default router;
