


function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  
  if (magA === 0 || magB === 0) {
    return 0;
  }

  const similarity = dotProduct / (magA * magB);

  
  return Math.min(1, Math.max(0, similarity));
}


function generatePairs(submissions) {
  const pairs = [];

  for (let i = 0; i < submissions.length; i++) {
    for (let j = i + 1; j < submissions.length; j++) {
      const a = submissions[i];
      const b = submissions[j];
      const score = cosineSimilarity(a.embedding, b.embedding);

      pairs.push({
        subA: a._id.toString(),
        subB: b._id.toString(),
        studentA: a.studentId.toString(),
        studentB: b.studentId.toString(),
        score: Math.round(score * 10000) / 10000 
      });
    }
  }

  return pairs;
}

module.exports = { cosineSimilarity, generatePairs };
