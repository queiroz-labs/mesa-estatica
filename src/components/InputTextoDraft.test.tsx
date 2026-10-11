import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ draft: null as string | null }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: () => [h.draft, (valor: string | null) => { h.draft = valor; }],
}));
import InputTextoDraft from './InputTextoDraft';

beforeEach(() => { h.draft = null; });

it('confirma uma edição inteira no blur sem emitir valores intermediários', () => {
  const onCommit = vi.fn();
  const render = () => InputTextoDraft({ value: 'Faca', onCommit });
  for (const value of ['F', 'Fa', 'Facão']) render().props.onChange({ target: { value } });
  expect(onCommit).not.toHaveBeenCalled();
  expect(render().props.value).toBe('Facão');
  render().props.onBlur();
  expect(onCommit).toHaveBeenCalledExactlyOnceWith('Facão');
});

it('Enter apenas desfoca, deixando o blur salvar uma vez, e respeita composição de texto', () => {
  const onCommit = vi.fn();
  const render = () => InputTextoDraft({ value: 'Faca', onCommit });
  render().props.onChange({ target: { value: 'Espada' } });
  const blur = vi.fn(() => render().props.onBlur());
  render().props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: true }, currentTarget: { blur } });
  expect(blur).not.toHaveBeenCalled();
  render().props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: false }, currentTarget: { blur } });
  expect(onCommit).toHaveBeenCalledExactlyOnceWith('Espada');
});

it('não salva texto intacto ou restaurado, mas permite limpar o campo', () => {
  const onCommit = vi.fn();
  const render = () => InputTextoDraft({ value: 'Faca', onCommit });
  render().props.onBlur();
  render().props.onChange({ target: { value: 'Faca' } });
  render().props.onBlur();
  expect(onCommit).not.toHaveBeenCalled();
  render().props.onChange({ target: { value: '' } });
  render().props.onBlur();
  expect(onCommit).toHaveBeenCalledExactlyOnceWith('');
});

it('reflete valores remotos sem sobrescrever um rascunho em edição', () => {
  const onCommit = vi.fn();
  expect(InputTextoDraft({ value: 'Remoto', onCommit }).props.value).toBe('Remoto');
  InputTextoDraft({ value: 'Remoto', onCommit }).props.onChange({ target: { value: 'Meu texto' } });
  expect(InputTextoDraft({ value: 'Outro remoto', onCommit }).props.value).toBe('Meu texto');
  expect(onCommit).not.toHaveBeenCalled();
});
