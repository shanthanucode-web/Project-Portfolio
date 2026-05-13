import OpenAI from 'openai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    const { model, messages } = req.body;

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await client.chat.completions.create({
      model: model || 'gpt-4o-mini',
      messages,
      max_tokens: 700,
      temperature: 0.7,
    });

    return res.status(200).json({
      output: response.choices[0].message.content.trim(),
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message || 'Server error',
    });
  }
}