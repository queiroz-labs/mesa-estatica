import { useState } from 'react';

interface Props {
  value: string;
  onCommit: (valor: string) => void;
  placeholder?: string;
}

/** Confirma texto ao sair do campo ou pressionar Enter: um registro por edição,
 * sem sincronizar/logar cada tecla. Sem rascunho, reflete atualizações remotas. */
export default function InputTextoDraft({ value, onCommit, placeholder }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      value={draft ?? value}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== value) onCommit(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur();
      }}
    />
  );
}
