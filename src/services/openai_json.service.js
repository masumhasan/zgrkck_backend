const { config } = require('../config/env');

// One OpenAI call that must return a JSON object. Used only to STRUCTURE text/photos of recipes; every result
// goes back through the code validators (recipe_import.service), never straight to the database.
const configured = () => Boolean(config.openaiApiKey) && !/PLACEHOLDER/i.test(config.openaiApiKey);

async function chatJson({ system, userText, imageDataUrl = null, timeoutMs = 60000 }) {
  const content = imageDataUrl ? [{ type: 'text', text: userText }, { type: 'image_url', image_url: { url: imageDataUrl } }] : userText;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.openaiApiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed (${res.status})`);
  const body = await res.json();
  return JSON.parse(body.choices?.[0]?.message?.content || '{}');
}

module.exports = { configured, chatJson };
