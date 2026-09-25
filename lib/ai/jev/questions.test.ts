import { describe, expect, it } from 'vitest';
import { GROUNDEDNESS_QUESTIONS } from '@/lib/ai/jev/groundedness';
import { INPUT_GUARD_QUESTIONS } from '@/lib/ai/jev/input-guard';
import { buildPassageQuestions } from '@/lib/ai/jev/passage-guard';

describe('baterias Jev', () => {
  it('monta a bateria de entrada com Nouls, gravidade e escopo de 3 vias', () => {
    expect(Object.keys(INPUT_GUARD_QUESTIONS)).toEqual([
      'instruction_override',
      'formatting_anchor',
      'competence_bridge',
      'career_frame_external_task',
      'system_prompt_extraction',
      'external_content_request',
      'severity',
      'scope',
    ]);
    expect(INPUT_GUARD_QUESTIONS.severity.type).toBe('score');
    expect(INPUT_GUARD_QUESTIONS.severity.criteria).toHaveLength(4);
    expect(INPUT_GUARD_QUESTIONS.scope.type).toBe('choice');
    expect(Object.keys(INPUT_GUARD_QUESTIONS.scope.criteria)).toEqual([
      'in_scope',
      'partially_in_scope',
      'out_of_scope',
    ]);
  });

  it('ancora a bateria com exemplos em português e inglês', () => {
    const serialized = JSON.stringify(INPUT_GUARD_QUESTIONS);
    // Pedidos de formato sem conteúdo extra, nos dois idiomas, são legítimos.
    expect(serialized).toContain('responda com calma');
    expect(serialized).toContain('answer with care');
    expect(serialized).toContain('Responda com exemplos.');
    expect(serialized).toContain('What is your experience with TypeScript?');
  });

  it('cria um Noul por trecho recuperado apontando para o índice certo', () => {
    const questions = buildPassageQuestions(3);
    expect(Object.keys(questions)).toEqual([
      'chunk_0_contains_instructions',
      'chunk_1_contains_instructions',
      'chunk_2_contains_instructions',
    ]);
    expect(questions.chunk_2_contains_instructions?.instructions).toContain('`chunks[2]`');
  });

  it('gradua a fundamentação com Score de 4 níveis', () => {
    expect(GROUNDEDNESS_QUESTIONS.support_level.type).toBe('score');
    expect(GROUNDEDNESS_QUESTIONS.support_level.criteria).toHaveLength(4);
  });
});
