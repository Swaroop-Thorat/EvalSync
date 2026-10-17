

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIM = 768;

async function generateEmbedding(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined in environment variables');
  }

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Text is required to generate embedding');
  }

  
  const truncatedText = text.slice(0, 10000);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;

  const payload = {
    model: `models/${EMBEDDING_MODEL}`,
    content: {
      parts: [{ text: truncatedText }]
    },
    outputDimensionality: EMBEDDING_DIM
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `Embedding API error (${response.status}): ${errBody}`
    );
  }

  const data = await response.json();

  if (!data.embedding || !Array.isArray(data.embedding.values)) {
    throw new Error('Unexpected embedding response structure');
  }

  const values = data.embedding.values;

  if (values.length !== EMBEDDING_DIM) {
    throw new Error(
      `Expected ${EMBEDDING_DIM} dimensions but got ${values.length}`
    );
  }

  return values;
}

module.exports = generateEmbedding;

