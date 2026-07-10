import fs from 'fs';
import path from 'path';
import { transcribeAudio } from '../services/groqService.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * POST /api/stt
 * Handles audio upload and returns transcription via Groq Whisper.
 */
export const handleSTT = async (req, res) => {
  let tempPath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No audio file uploaded' });
    }

    // Save buffer to a temporary file for Groq SDK to read correctly
    tempPath = path.join(__dirname, `../../temp_stt_${Date.now()}.webm`);
    fs.writeFileSync(tempPath, req.file.buffer);

    // Create stream
    const fileStream = fs.createReadStream(tempPath);
    
    // Transcribe with Whisper-large-v3
    const text = await transcribeAudio(fileStream);

    // Cleanup temp file
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }

    res.status(200).json({ text });
  } catch (err) {
    console.error('STT Controller Error:', err);
    
    // Ensure cleanup even on error
    if (tempPath && fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (e) {}
    }
    
    res.status(500).json({ message: 'Transcription failed' });
  }
};
