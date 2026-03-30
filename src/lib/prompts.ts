import { parsePrompt, renderPrompt } from '@nuucognition/prompt-loader';

export type OrbCodePromptName =
  | 'refactor'
  | 'refine'
  | 'create-feature'
  | 'create-ui'
  | 'create-task'
  | 'create-test'
  | 'create-e2e'
  | 'create-system';

async function loadPromptFile(name: OrbCodePromptName) {
  const response = await fetch(`${import.meta.env.BASE_URL}${name}.md`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load prompt "${name}" (${response.status})`);
  }
  return parsePrompt(await response.text());
}

export async function renderOrbCodePrompt(
  name: OrbCodePromptName,
  variables: Record<string, string | undefined>,
): Promise<string> {
  const prompt = await loadPromptFile(name);
  return renderPrompt(prompt.body, variables, prompt.metadata);
}
