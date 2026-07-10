import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });

/**
 * Strip Markdown code fences (```json ... ``` or ``` ... ```) that some
 * models wrap around JSON responses, so the payload can be JSON.parse'd.
 */
function stripJsonFences(content = '') {
  if (content.startsWith('```json')) {
    return content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  }
  if (content.startsWith('```')) {
    return content.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return content;
}

/**
 * analyzeResume(resumeText)
 * Parses raw resume text and returns structured data.
 */
export async function analyzeResume(resumeText) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  const prompt = `You are an expert resume parser. Analyze the following resume text and extract key information.
Return ONLY a valid JSON object with these fields:
- "name" (string): the candidate's full name
- "detectedRole" (string): the most likely job role (e.g. "Software Engineer", "Product Manager", "Designer", "Marketing")
- "skills" (array of strings): top 8 technical and soft skills
- "experienceLevel" (string): one of "intern", "junior", "mid", "senior" based on years/depth of experience
- "projects" (array of strings): up to 5 notable projects or achievements mentioned
- "summary" (string): a 2-3 sentence professional summary

Resume Text:
${resumeText.slice(0, 4000)}`;

  const completion = await groq.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    model: 'llama-3.1-8b-instant',
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const content = stripJsonFences(completion.choices[0]?.message?.content || '');
  return JSON.parse(content);
}

/**
 * extractTextFromImage(base64Image, mimeType)
 * Uses Groq vision model to OCR a resume image.
 */
export async function extractTextFromImage(base64Image, mimeType) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract ALL text from this resume image. Return the complete text content exactly as it appears, preserving the structure. Do not summarize or skip any section.',
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    model: 'llama-3.2-11b-vision-preview',
    temperature: 0.1,
    max_tokens: 4000,
  });

  return completion.choices[0]?.message?.content || '';
}

/**
 * generateQuestions(role, level, interviewType, resumeContext)
 * If resumeContext is provided, generates personalized questions.
 */
export async function generateQuestions(role, level, interviewType, resumeContext = null, jobDescription = '', difficulty = 'medium', personality = 'standard') {
  if (!process.env.GROQ_API_KEY) {
    console.warn('⚠️ GROQ_API_KEY missing - using fallback mock questions');
    return {
      isAiGenerated: false,
      isResumeTailored: false,
      questions: [
        'Tell me about a time you led a team through a difficult project.',
        'How do you prioritise tasks when everything feels urgent?',
        'Describe a situation where you had to learn something quickly.',
        'Walk me through how you would design a notification system.',
        'Give an example of a time you received tough feedback and how you handled it.',
        'What is your approach to making decisions with incomplete information?',
      ],
    };
  }

  try {
    let prompt;
    
    let personalityPrompt = "Adopt the persona of a professional, standard HR technical interviewer.";
    if (personality === 'mentor') {
        personalityPrompt = "Adopt the persona of a highly supportive mentor. Your tone (especially in the intro) should be encouraging and focus on drawing out their strengths in a friendly manner.";
    } else if (personality === 'faang') {
        personalityPrompt = "Adopt the persona of a high-stress, skeptical FAANG 'bar raiser' interviewer. Your tone should be extremely formal, slightly intimidating, and push their limits.";
    }

    if (resumeContext) {
      let jdContext = jobDescription ? `\n\nJOB DESCRIPTION (TARGET): \n${jobDescription}\n` : '';
      prompt = `You are an elite interview coach. ${personalityPrompt} Based on the candidate's resume, generate interview questions that are highly personalized.${jdContext}

CANDIDATE RESUME CONTEXT:
- Name: ${resumeContext.name || 'Unknown'}
- Detected Role: ${resumeContext.detectedRole || role}
- Skills: ${(resumeContext.skills || []).join(', ')}
- Experience Level: ${resumeContext.experienceLevel || level}
- Projects: ${(resumeContext.projects || []).join(', ')}
- Summary: ${resumeContext.summary || 'N/A'}

Generate 3 questions specifically tailored to this candidate's resume (referencing their actual projects, skills, and experience), 2 behavioral/situational questions (e.g., 'Tell me about a time...'), and 1 challenging ${interviewType} question for a ${level} level ${role} role. The difficulty of these questions should be exactly ${difficulty.toUpperCase()}, reflecting the expectations of that difficulty level. ${jobDescription ? 'Ensure questions specifically test requirements from the Job Description.' : ''}

Return ONLY a JSON object with a "questions" array of 6 strings. The very first question MUST be a friendly introduction acting like an interviewer meeting them for the first time, similar to: "How are you ${resumeContext.name || 'there'}? I was looking at your resume, specifically your experience with [pick a skill/project], and let's move forward with the interview." Then generate 2 questions tailored to the resume, 2 behavioral questions, and 1 role-specific question.`;
    } else {
      let jdContext = jobDescription ? `\n\nJOB DESCRIPTION (TARGET):\n${jobDescription}\n Ensure questions directly address these specific job requirements.` : '';
      prompt = `You are an elite interview coach. ${personalityPrompt} Given a role, level, and interview type, generate 6 specific and challenging interview questions. The difficulty of these questions should be exactly ${difficulty.toUpperCase()}. Return ONLY a JSON object with a "questions" array of strings.\n\nThe very first question MUST be a friendly introduction: "How are you doing today? I see you're interviewing for the ${level} ${role} role. Let's move forward with the interview." Then generate 3 ${interviewType} questions and 2 behavioral/situational questions.${jdContext}`;
    }

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.1-8b-instant',
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const content = stripJsonFences(completion.choices[0]?.message?.content || '');
    const parsed = JSON.parse(content);
    return { ...parsed, isAiGenerated: true, isResumeTailored: !!resumeContext };
  } catch (error) {
    console.warn('⚠️ AI question generation error. Gracefully degrading to random fallback questions.', error.message);

    const fallbackPools = {
      swe: [
        'How would you scale a web application to handle 1 million concurrent users?',
        'Describe a time you had to optimize a very slow database query.',
        'What is your approach to testing a critical payment processing service?',
        'Walk me through the architecture of a real-time chat application.',
        'Explain event loop mechanics and how you avoid blocking the main thread.',
        'How do you handle breaking changes in an API that is actively consumed by clients?',
        'Describe the trade-offs between monolithic and microservice architectures.',
      ],
      pm: [
        'How do you prioritize features when engineering and sales disagree?',
        'Walk me through your process for launching a feature that failed.',
        'Describe an instance where you relied heavily on data to pivot a product strategy.',
        'How would you define the minimum viable product for a new grocery delivery app?',
        'What metrics would you use to measure the success of a new onboarding flow?',
        'How do you handle a critical launch delay due to technical debt?',
      ],
      default: [
        'Tell me about a time you led a team through a difficult project.',
        'How do you prioritise tasks when everything feels urgent?',
        'Describe a situation where you had to learn something quickly.',
        'Give an example of a time you received tough feedback and how you handled it.',
        'What is your approach to making decisions with incomplete information?',
        'Describe a time when you strongly disagreed with a manager and how you resolved it.',
        'What are your primary strategies for resolving team conflicts?',
        'Tell me about your proudest professional achievement.',
      ],
    };

    const pool = fallbackPools[role] || fallbackPools.default;
    const shuffled = pool.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 6);

    return { questions: selected, isAiGenerated: false, isResumeTailored: false };
  }
}

/**
 * generateReaction(question, answer)
 * Provides a very brief, conversational human-like reaction to an answer.
 */
export async function generateReaction(question, answer, personality = 'standard') {
  if (!process.env.GROQ_API_KEY) {
    return "Great point."; // Fast fallback
  }

  let personaDetail = "friendly, professional interview coach";
  if (personality === 'mentor') personaDetail = "highly supportive mentor who is constantly encouraging and kind";
  if (personality === 'faang') personaDetail = "cold, skeptical, high-stress FAANG interviewer who is hard to impress";

  const prompt = `You are a ${personaDetail}.
The candidate just answered the following question:
Question: "${question}"
Answer: "${answer}"

Provide a VERY brief (1 sentence MAX, under 15 words) natural, conversational reaction. 
Acknowledge what they said encouragingly before the next question.
Examples: "That's a very diplomatic way to handle conflict.", "I like your focus on team building there.", "Good point about scalability."
Do NOT ask another question. Do NOT give long feedback. Just a quick transitional reaction.`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.1-8b-instant', // fastest model for quick responses
      temperature: 0.7,
      max_tokens: 30, // keep it super short
    });

    let content = completion.choices[0]?.message?.content?.trim() || 'I see, great point.';
    
    // Strip quotes if LLM added them
    if (content.startsWith('"') && content.endsWith('"')) {
      content = content.substring(1, content.length - 1);
    }
    return content;
  } catch (error) {
    console.error('Error in Groq Reaction:', error);
    return "Interesting point."; // Fallback
  }
}

/**
 * analyseAnswer(transcript, snapshots)
 * Analyzes the full interview transcript and returns rich, actionable feedback.
 */
export async function analyseAnswer(transcript, snapshots = []) {
  if (!process.env.GROQ_API_KEY) {
    return {
      clarity: 7,
      relevance: 8,
      structure: 6,
      confidence: 7,
      overallScore: 7,
      fillerWordCount: 3,
      feedback: 'Good overall, but you missed some STAR method structures.',
      starFeedback: 'You did well on Situation and Task, but missed detailing the specific Action you took and measurable Results.',
      modelAnswer: 'A good approach uses the STAR method...',
    };
  }

  // Optional: Vision-based Body Language Analysis
  let bodyLanguageContext = "";
  if (snapshots && snapshots.length > 0) {
    try {
      // Grab the clearest snapshot (middle of interview or first valid one)
      const validSnapshot = snapshots.filter(s => !!s)[Math.floor(snapshots.length / 2)] || snapshots.find(s => !!s);
      if (validSnapshot) {
        const visionRes = await groq.chat.completions.create({
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'You are an interview behavioral analyst. Look at this single frame from the candidate\'s webcam during their interview. Analyze their body language, posture, and facial expression. Keep it to 2 brief sentences.' },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${validSnapshot}` } }
              ]
            }
          ],
          model: 'llama-3.2-11b-vision-preview',
          temperature: 0.2,
          max_tokens: 100,
        });
        bodyLanguageContext = `\n\nNON-VERBAL ANALYSIS (From Webcam Snapshot): \n"${visionRes.choices[0]?.message?.content || 'Neutral body language.'}"\nNote: Incorporate a remark about their body language in the main feedback.`;
      }
    } catch (err) {
      console.warn("Vision AI failed to analyze body language:", err.message);
    }
  }

  try {
    const prompt = `You are a supportive, world-class interview coach and communication mentor. You have been given a complete interview transcript to evaluate.${bodyLanguageContext}

Your role is to be an ENCOURAGING MENTOR — someone who genuinely wants this candidate to improve. Be SPECIFIC and ACTIONABLE with your feedback, but always lead with what they did well before addressing areas for growth. Celebrate effort and progress.

GRADING PHILOSOPHY:
- A candidate who shows up, tries their best, and gives reasonable answers deserves a baseline of 6-7/10.
- Scores of 8-9/10 are for strong, well-structured answers that demonstrate real preparation.
- A perfect 10/10 is rare but achievable for truly exceptional responses.
- Scores below 5 should only be given if the candidate skipped questions entirely or gave completely off-topic answers.
- Always give credit for attempting an answer, even if it's imperfect. Growth comes from practice.

EVALUATION CRITERIA (score each 0-10):

1. **CLARITY** (0-10): How well did the candidate communicate their ideas?
   - Reward: clear explanations, good vocabulary, logical sentence structure
   - Note for improvement: vague language, unclear phrasing, or jargon misuse

2. **RELEVANCE** (0-10): How well did the answers address the questions?
   - Reward: directly answering what was asked, staying on topic, addressing key points
   - Note for improvement: going off on tangents, giving overly generic responses

3. **STRUCTURE** (0-10): How organized were the responses?
   - Reward: clear beginning/middle/end, use of frameworks (STAR, etc.), logical flow
   - Note for improvement: rambling, jumping between topics, missing conclusions

4. **CONFIDENCE** (0-10): How assured and professional did the candidate sound?
   - Reward: decisive language, owning accomplishments, speaking with conviction
   - Note for improvement: excessive hedging, self-deprecation, heavy filler word usage

FILLER WORD DETECTION:
Count ALL instances of: um, uh, like (as filler), basically, you know, sort of, kind of, I mean, right?, actually (as filler). Be thorough. Extract a list of the exact unique filler words used.

Return ONLY a valid JSON object with this EXACT structure:
{
  "clarity": <integer 0-10>,
  "relevance": <integer 0-10>,
  "structure": <integer 0-10>,
  "confidence": <integer 0-10>,
  "overallScore": <integer 0-10>,
  "fillerWordCount": <integer>,
  "fillerWordsList": [<array of strings of specific filler words detected, e.g. ["um", "like"]>],
  "feedback": "<DETAILED paragraph: 4-6 sentences. START with what the candidate did well — acknowledge their strengths and effort. Then identify 1-2 specific areas for growth with concrete examples from the transcript. End with an encouraging, actionable tip they can apply in their next practice session.>",
  "starFeedback": "<DETAILED STAR analysis: 3-5 sentences. Grade each STAR component (Situation/Task/Action/Result) separately. Highlight which components they handled well. For weaker components, explain specifically how they could strengthen them next time. If they didn't use STAR, gently explain the framework and show where it would have helped.>",
  "modelAnswer": "<Write a complete, polished EXAMPLE answer for the question they struggled with most. This should be 4-6 sentences using STAR structure, demonstrating what an ideal response looks like. Start by stating which question this model answer is for. Frame it as 'Here is how you could level up your answer'.>"
}

CRITICAL: All score fields (clarity, relevance, structure, confidence, overallScore) must be at the TOP LEVEL of the JSON, not nested inside a "scores" object. The fillerWordCount must be an integer.

TRANSCRIPT TO ANALYZE:
${transcript}`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.1-8b-instant',
      temperature: 0.4,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const content = stripJsonFences(completion.choices[0]?.message?.content || '');
    const raw = JSON.parse(content);

    // Normalize: handle both flat and nested score formats from the LLM
    const scores = raw.scores || {};
    const result = {
      clarity:        Math.min(10, Math.max(0, parseInt(raw.clarity ?? scores.clarity ?? 0))),
      relevance:      Math.min(10, Math.max(0, parseInt(raw.relevance ?? scores.relevance ?? 0))),
      structure:      Math.min(10, Math.max(0, parseInt(raw.structure ?? scores.structure ?? 0))),
      confidence:     Math.min(10, Math.max(0, parseInt(raw.confidence ?? scores.confidence ?? 0))),
      overallScore:   Math.min(10, Math.max(0, parseInt(raw.overallScore ?? scores.overallScore ?? 0))),
      fillerWordCount: parseInt(raw.fillerWordCount ?? raw.filler_word_count ?? 0),
      fillerWordsList: Array.isArray(raw.fillerWordsList) ? raw.fillerWordsList : [],
      feedback:       raw.feedback || 'No detailed feedback was generated. Please try again.',
      starFeedback:   raw.starFeedback || raw.star_feedback || '',
      modelAnswer:    raw.modelAnswer || raw.model_answer || '',
    };

    // Safety: ensure overallScore is computed if LLM returned 0
    if (result.overallScore === 0 && (result.clarity + result.relevance + result.structure + result.confidence) > 0) {
      result.overallScore = Math.round(
        (result.clarity + result.relevance + result.structure + result.confidence) / 4
      );
    }

    console.log('✅ AI Feedback generated — scores:', {
      clarity: result.clarity,
      relevance: result.relevance,
      structure: result.structure,
      confidence: result.confidence,
      overall: result.overallScore,
      fillers: result.fillerWordCount,
    });

    return result;
  } catch (error) {
    console.warn('⚠️ AI answer analysis error. Gracefully degrading to fallback feedback.', error.message);
    return {
      clarity: 5,
      relevance: 6,
      structure: 4,
      confidence: 6,
      overallScore: 5,
      fillerWordCount: 5,
      feedback: 'We were unable to fully analyze your interview due to a temporary system issue. Based on a surface-level review, your answers touched on the right themes but could benefit from more structured delivery using the STAR method. Focus on providing specific examples with measurable outcomes.',
      starFeedback: 'STAR Method Assessment: Without full analysis, we recommend practicing each component — lead with a clear Situation (1-2 sentences of context), define the Task (your specific responsibility), detail your Action (step-by-step what YOU did), and close with quantifiable Results.',
      modelAnswer: 'A strong model answer follows this pattern: "When I was at [Company], we faced [specific situation]. I was responsible for [specific task]. I took the following steps: [1, 2, 3]. As a result, we achieved [measurable outcome]."',
    };
  }
}

/**
 * generateHint(question)
 * Provides a short bulleted hint for a given question.
 */
export async function generateHint(question) {
  if (!process.env.GROQ_API_KEY) {
    return "Think about the STAR method: Situation, Task, Action, Result. Focus on your specific contribution.";
  }

  try {
    const prompt = `You are a supportive interview coach. The user is stuck on this question: "${question}"
Provide a very brief 1-2 sentence hint or 2 short bullet points on what they should cover in their answer to succeed. Do NOT write the answer for them, just give a strategic hint.`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.1-8b-instant',
      temperature: 0.5,
      max_tokens: 150,
    });

    return completion.choices[0]?.message?.content?.trim() || "Think about the STAR method: Situation, Task, Action, Result.";
  } catch (err) {
    console.error('Hint generation error:', err.message);
    return "Think about the STAR method: Situation, Task, Action, Result. Focus on your specific contribution.";
  }
}

/**
 * generateFollowUp(question, answer)
 * Generates a follow-up question based on the user's answer.
 */
export async function generateFollowUp(question, answer, personality = 'standard') {
  if (!process.env.GROQ_API_KEY) {
    return "That's interesting. Can you tell me more about the specific challenges you faced?";
  }

  let personaDetail = "tough but fair interview coach";
  if (personality === 'mentor') personaDetail = "supportive mentor trying to gently guide them to expand their thought";
  if (personality === 'faang') personaDetail = "skeptical, high-stress FAANG 'bar raiser' who scrutinizes every claim and probes for edge-case failures";

  try {
    const prompt = `You are a ${personaDetail}.
The user was asked: "${question}"
Their answer was: "${answer}"

Generate ONE challenging follow-up question that digs deeper into their answer. Probe for specifics, results, or alternative approaches. 
Keep the question under 2 sentences. Do NOT praise them, just ask the follow-up directly.`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.1-8b-instant',
      temperature: 0.7,
      max_tokens: 150,
    });

    return completion.choices[0]?.message?.content?.trim() || "Can you elaborate more on your thought process there?";
  } catch (err) {
    console.error('Follow-up generation error:', err.message);
    return "Can you elaborate more on your thought process there?";
  }
}

/**
 * transcribeAudio(fileStream)
 * Transcribes audio using Groq Whisper-large-v3.
 */
export async function transcribeAudio(fileStream) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  const transcription = await groq.audio.transcriptions.create({
    file: fileStream,
    model: 'whisper-large-v3',
    response_format: 'json',
    language: 'en',
    temperature: 0.0,
  });

  return transcription.text;
}
