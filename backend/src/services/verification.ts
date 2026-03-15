import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface VerificationRequest {
  repositoryUrl: string;
  milestoneDescription: string;
  projectId: string;
}

interface VerificationResult {
  id: string;
  projectId: string;
  status: 'passed' | 'failed' | 'pending';
  score: number;
  summary: string;
  details: string[];
  verifiedAt: string;
}

// In-memory store (replace with DB in production)
const verifications = new Map<string, VerificationResult>();

export async function verifyWork(request: VerificationRequest): Promise<VerificationResult> {
  const id = `ver_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // TODO: Fetch actual repo contents via GitHub API
  // For now, use AI to generate a verification assessment

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You are a code reviewer. Given a milestone description and repository URL, assess whether the work likely meets the requirements. Respond with a JSON object containing: score (0-100), summary (one sentence), details (array of specific observations).',
      },
      {
        role: 'user',
        content: `Repository: ${request.repositoryUrl}\nMilestone: ${request.milestoneDescription}`,
      },
    ],
    response_format: { type: 'json_object' },
  });

  const assessment = JSON.parse(completion.choices[0].message.content || '{}');

  const result: VerificationResult = {
    id,
    projectId: request.projectId,
    status: (assessment.score || 0) >= 70 ? 'passed' : 'failed',
    score: assessment.score || 0,
    summary: assessment.summary || 'Verification completed',
    details: assessment.details || [],
    verifiedAt: new Date().toISOString(),
  };

  verifications.set(id, result);
  return result;
}

export async function getVerification(id: string): Promise<VerificationResult | undefined> {
  return verifications.get(id);
}
