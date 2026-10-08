/** Traduz a origem de um aviso sem expor nomes de canais ou chaves da mesa. */
export function recursosDaMesa(modulos: Iterable<string>): string[] {
  const recursos = new Set<string>();
  for (const modulo of modulos) {
    if (/ficha/.test(modulo)) recursos.add('fichas');
    else if (/npc|visibilidade/.test(modulo)) recursos.add('personagens do mestre');
    else if (/token/.test(modulo)) recursos.add('tokens no mapa');
    else if (/regua/.test(modulo)) recursos.add('régua');
    else if (/aoe/.test(modulo)) recursos.add('áreas de efeito');
    else if (/ping/.test(modulo)) recursos.add('pings no mapa');
    else if (/dados|roll|rolagem/.test(modulo)) recursos.add('rolagens');
    else if (/log/.test(modulo)) recursos.add('registros da sessão');
    else if (/iniciativa/.test(modulo)) recursos.add('combate');
    else if (/mapa/.test(modulo)) recursos.add('mapas');
    else if (/midia|soundpad/.test(modulo)) recursos.add('áudio');
    else if (/sessao/.test(modulo)) recursos.add('cena e estado da sessão');
    else recursos.add('outros recursos da mesa');
  }
  return [...recursos].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
