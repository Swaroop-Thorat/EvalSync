
require('dotenv').config();

const GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash'
];

function extractJson(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {}

  const stripped = trimmed.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(stripped);
  } catch (_) {}

  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(stripped.slice(firstBrace, lastBrace + 1));
    } catch (_) {}
  }

  const firstBracket = stripped.indexOf('[');
  const lastBracket = stripped.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(stripped.slice(firstBracket, lastBracket + 1));
    } catch (_) {}
  }

  return null;
}

function analyzeStylisticPatterns(text) {
  const clean = (text || '').trim();
  if (clean.length < 30) {
    return {
      aiProbability: 20,
      verdict: 'Low AI Likelihood',
      label: 'AI-Likelihood Estimate (Not proof of AI authorship)',
      explanation: 'Text sample is very brief; insufficient structural indicators for elevated AI probability.',
      provider: 'EvalSync Stylistic Analyzer (Standby)',
      isFallback: true
    };
  }

  const sentences = clean
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 5);

  const words = clean.toLowerCase().match(/\b[a-z]{2,}\b/g) || [];
  const wordCount = Math.max(words.length, 1);

  const lengths = sentences.map(s => (s.match(/\b[a-z]{2,}\b/gi) || []).length);
  const meanLength = lengths.reduce((a, b) => a + b, 0) / Math.max(lengths.length, 1);
  const variance = lengths.reduce((acc, l) => acc + Math.pow(l - meanLength, 2), 0) / Math.max(lengths.length, 1);
  const stdDev = Math.sqrt(variance);

  const aiMarkers = [
    'furthermore', 'moreover', 'delve', 'crucial', 'testament', 'pivotal',
    'paramount', 'in conclusion', 'it is worth noting', 'comprehensive understanding',
    'embark', 'multifaceted', 'underpins', 'seamlessly', 'nuanced', 'imperative',
    'foster', 'landscape', 'beacon', 'underscores', 'meticulously', 'in essence',
    'it is important to note', 'serves as a testament'
  ];

  let markerMatches = 0;
  const lower = clean.toLowerCase();
  for (const marker of aiMarkers) {
    const regex = new RegExp(`\\b${marker}\\b`, 'gi');
    const matches = lower.match(regex);
    if (matches) markerMatches += matches.length;
  }

  const markerDensity = (markerMatches / wordCount) * 100;

  let baseScore = 28;

  if (markerDensity > 1.2) {
    baseScore += 35;
  } else if (markerDensity > 0.6) {
    baseScore += 22;
  } else if (markerDensity > 0.2) {
    baseScore += 10;
  }

  if (stdDev < 4.0 && sentences.length >= 4) {
    baseScore += 18;
  } else if (stdDev < 6.0 && sentences.length >= 3) {
    baseScore += 8;
  } else if (stdDev > 10.0) {
    baseScore -= 12;
  }

  const uniqueWords = new Set(words).size;
  const ttr = uniqueWords / wordCount;
  if (ttr > 0.75 && wordCount > 80) {
    baseScore += 8;
  }

  const finalProb = Math.min(92, Math.max(8, Math.round(baseScore)));
  const isHigh = finalProb > 50;

  return {
    aiProbability: finalProb,
    verdict: isHigh ? 'Elevated AI Likelihood' : 'Low AI Likelihood',
    label: 'AI-Likelihood Estimate (Not proof of AI authorship)',
    explanation: isHigh
      ? `Stylistic analysis identified uniform sentence cadence (variance: ${stdDev.toFixed(1)}) and elevated transitional markers typical of generated text.`
      : `Stylistic analysis indicates authentic syntactic variability (variance: ${stdDev.toFixed(1)}) and natural sentence cadence.`,
    provider: 'EvalSync Stylistic Analyzer (Standby)',
    isFallback: true
  };
}

async function callGemini(prompt, systemInstruction = '') {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined in environment variables');
  }

  let lastError = null;

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          topP: 0.95
        }
      };

      if (systemInstruction) {
        payload.systemInstruction = {
          parts: [{ text: systemInstruction }]
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000)
      });

      if (!res.ok) {
        const errText = await res.text();
        lastError = new Error(`Gemini ${model} error (${res.status}): ${errText}`);
        continue; 
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return text;
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini models failed to generate content');
}


async function generateVivaQuestions(assignmentTitle, topic, studentText) {
  const prompt = `You are an academic evaluator. Based on the assignment titled "${assignmentTitle}" on the topic "${topic}", and the following student submission excerpt, suggest 4 to 5 rigorous viva/oral examination questions to evaluate the student's authentic understanding and detect if they just copied or used generative AI.

Student Submission Excerpt:
"${(studentText || '').slice(0, 3000)}"

Return ONLY a valid JSON array of objects with the keys "question" and "rationale".
Do not wrap in markdown quotes if possible, or return raw JSON.
Example format:
[
  {
    "question": "Can you explain why you chose X approach over Y?",
    "rationale": "Probes depth of design decisions."
  }
]`;

  try {
    const raw = await callGemini(prompt, 'You are an academic assessment assistant. Always respond with clean, valid JSON.');
    const parsed = extractJson(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (err) {
    console.warn('Gemini question generation fallback active:', err.message);
  }

  return [
    {
      question: `Can you explain the core concepts and design decisions you made regarding ${topic || assignmentTitle}?`,
      rationale: 'Probes foundational understanding of topic principles.'
    },
    {
      question: `How would your solution handle edge cases, concurrent access, or high load under resource limits?`,
      rationale: 'Tests critical thinking and scalability considerations beyond static code.'
    },
    {
      question: `What specific debugging steps or trade-offs did you face while drafting this submission?`,
      rationale: 'Verifies authentic hands-on authorship and problem-solving experience.'
    },
    {
      question: `If asked to extend this implementation for distributed environments, what architecture would you choose?`,
      rationale: 'Evaluates architectural depth and systems-level comprehension.'
    }
  ];
}


async function checkRelevance(assignmentTitle, topic, studentText) {
  const prompt = `Evaluate if the following student submission is relevant to the coursework topic.

Assignment: "${assignmentTitle}"
Expected Topic: "${topic}"

Student Text Excerpt:
"${(studentText || '').slice(0, 3000)}"

Analyze whether the content discusses the expected topic or if it is completely unrelated/off-topic.
Return ONLY a valid JSON object with:
- "isRelevant": boolean (true if relevant, false if off-topic)
- "confidence": number between 0 and 100
- "explanation": a concise 1-2 sentence justification

Example format:
{
  "isRelevant": true,
  "confidence": 95,
  "explanation": "The text directly addresses concurrency primitives and deadlock conditions."
}`;

  try {
    const raw = await callGemini(prompt, 'You are an academic evaluator. Always return strictly valid JSON.');
    const parsed = extractJson(raw);
    if (parsed && typeof parsed.isRelevant === 'boolean') {
      return parsed;
    }
  } catch (err) {
    console.warn('Gemini relevance check fallback active:', err.message);
  }

  const text = (studentText || '').toLowerCase();
  const topWords = (topic || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const matchCount = topWords.filter(w => text.includes(w)).length;
  const isMatch = topWords.length === 0 || matchCount > 0;

  return {
    isRelevant: isMatch,
    confidence: isMatch ? 88 : 45,
    explanation: isMatch
      ? `Submission text contains relevant technical terminology matching "${topic}".`
      : `Submission content does not strongly address the required core concepts of "${topic}".`
  };
}


async function detectAiLikelihood(studentText) {
  const prompt = `You are an AI detection evaluator. Analyze the following student text excerpt for patterns typical of generative AI vs authentic human student writing.
Look for typical LLM indicators such as repetitive transitions, hyper-regular sentence structures, generic over-elaborations, lack of authentic mistakes or personal problem-solving voice.

Student Text Excerpt:
"${(studentText || '').slice(0, 3500)}"

Return ONLY a strictly valid JSON object with:
- "aiProbability": an integer percentage from 0 to 100 representing estimated likelihood that the content was AI-generated
- "verdict": a short label ("Elevated AI Likelihood" if > 50, else "Low AI Likelihood")
- "label": "AI-Likelihood Estimate (Not proof of AI authorship)"
- "explanation": a concise 1-2 sentence explanation of syntactic patterns observed

Example format:
{
  "aiProbability": 35,
  "verdict": "Low AI Likelihood",
  "label": "AI-Likelihood Estimate (Not proof of AI authorship)",
  "explanation": "Text demonstrates authentic syntactic variability, specific project-level problem descriptions, and human error patterns."
}`;

  try {
    const raw = await callGemini(prompt, 'You are an academic linguistic evaluator. Always return strictly valid JSON.');
    const parsed = extractJson(raw);
    if (parsed && typeof parsed.aiProbability === 'number') {
      const prob = Math.min(100, Math.max(0, Math.round(parsed.aiProbability)));
      return {
        aiProbability: prob,
        verdict: prob > 50 ? 'Elevated AI Likelihood' : 'Low AI Likelihood',
        label: 'AI-Likelihood Estimate (Not proof of AI authorship)',
        explanation: parsed.explanation || (prob > 50 ? 'Demonstrates typical generative AI phrasing and uniform cadence.' : 'Demonstrates authentic human writing variability.'),
        provider: 'Gemini AI Detector',
        isFallback: false
      };
    }
  } catch (err) {
    console.warn('Gemini AI detection fallback active:', err.message);
  }

  return analyzeStylisticPatterns(studentText);
}

module.exports = {
  callGemini,
  generateVivaQuestions,
  checkRelevance,
  detectAiLikelihood,
  analyzeStylisticPatterns
};
