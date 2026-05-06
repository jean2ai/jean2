export const definition = {
  name: 'test-fixture-tool',
  description: 'A minimal test fixture tool for integration tests.',
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'A message to echo' },
    },
    required: ['message'],
  },
  timeout: 5000,
};

export async function execute(input: { message: string }): Promise<{ success: boolean; result: { echo: string } }> {
  return {
    success: true,
    result: { echo: input.message },
  };
}
