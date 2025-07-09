// backend/server.js
import express from 'express';
import bodyParser from 'body-parser';
import connectDB from './db.js';
import { User } from './models/user.js';
import cors from 'cors';
import multer from 'multer';
import extract from 'pdf-text-extract';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

// Initialize App
const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Connect to MongoDB
connectDB();

// Gemini API Configuration
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Multer setup
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'), false);
    }
    cb(null, true);
  },
});

// Routes

app.get("/", (req, res) => {
  res.send("✅ Resume Review Backend is running with Gemini");
});

// Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.password !== password) {
      return res.status(401).json({ error: "Invalid password" });
    }

    res.status(200).json({
      message: "Login successful",
      user: {
        username: user.username,
        email: user.email,
        age: user.age,
        name: user.name
      }
    });

  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Signup
app.post("/signup", async (req, res) => {
  try {
    const { username, name, age, email, password } = req.body;

    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) return res.status(400).json({ error: "User already exists" });

    const user = new User({ username, name, age, email, password });
    await user.save();

    res.status(201).json({ message: "User created successfully", user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload Resume and Process with Gemini
app.post("/upload-resume", (req, res) => {
  upload.single("resume")(req, res, async function (err) {
    if (err instanceof multer.MulterError || err) {
      return res.status(400).json({ error: err.message || "Upload error" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      const tempFileName = `temp_${uuidv4()}.pdf`;
      const tempFilePath = path.join('./', tempFileName);
      fs.writeFileSync(tempFilePath, req.file.buffer);

      extract(tempFilePath, { splitPages: false }, async (err, text) => {
        fs.unlinkSync(tempFilePath); // Clean up

        if (err) {
          console.error("Text extraction error:", err);
          return res.status(500).json({ error: "Failed to extract text from PDF" });
        }

        const resumeText = Array.isArray(text) ? text.join(' ') : text;

        try {
          // Updated model name - use one of these current models
          const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

          // Enhanced prompt for better resume feedback
          const prompt = `You are a professional resume reviewer and career advisor. Please analyze the following resume and provide detailed, constructive feedback covering:

1. Overall Structure and Format
2. Content Quality and Relevance  
3. Skills and Experience Presentation
4. Areas for Improvement
5. Specific Recommendations

Resume Content:
${resumeText}

Please provide actionable feedback that will help improve this resume's effectiveness.`;

          const result = await model.generateContent(prompt);
          let reply = await result.response.text();
          reply = reply.replace(/\*/g, '');

          return res.status(200).json({ response: reply });

        } catch (geminiError) {
          console.error("Gemini API error:", geminiError.message);

          // More specific error handling
          if (geminiError.message.includes('API key')) {
            return res.status(401).json({ error: "Invalid API key. Please check your Gemini API key." });
          } else if (geminiError.message.includes('quota')) {
            return res.status(429).json({ error: "API quota exceeded. Please try again later." });
          } else {
            return res.status(500).json({ error: "Failed to process with Gemini API" });
          }
        }
      });

    } catch (err) {
      console.error("Resume processing error:", err.message);
      return res.status(500).json({ error: "Failed to handle resume" });
    }
  });
});

// Start server
app.listen(port, () => {
  console.log(`✅ Server is running at http://localhost:${port}`);
});