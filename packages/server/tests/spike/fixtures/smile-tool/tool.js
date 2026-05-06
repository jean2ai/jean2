// Minimal tool fixture for the Arborist feasibility spike.
// Imports a real npm dependency (emoji-regex) to prove dep resolution works.

import emojiRegex from 'emoji-regex';

export const definition = {
  name: 'smile-tool',
  description: 'A spike fixture tool that detects emojis in text.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to check for emojis' },
    },
    required: ['text'],
  },
  timeout: 5000,
};

export async function execute(input) {
  const regex = emojiRegex();
  const matches = input.text.match(regex);
  const emojis = matches ? [...new Set(matches)] : [];
  return {
    success: true,
    result: { emojis, count: emojis.length },
  };
}
