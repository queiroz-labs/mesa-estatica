# Estática — Referência de Regras (fonte da verdade)

> Extraído do `estatica-guia-do-jogador.pdf` (regras v0.15, julho/2026) e da `estatica-ficha.docx`.
> **Se o código divergir deste arquivo, o código está errado.** Não inventar regra: o que não estiver aqui, perguntar ao mestre (o usuário).

## O teste

`d20 + Atributo + Perícia` contra uma DT:

| Dificuldade | DT |
|---|---|
| Fácil | 10 |
| Média | 15 |
| Difícil | 20 |
| Extrema | 25 |

- **Margem de 10+**: passou da DT por 10 ou mais → efeito extra (em ataque: **dano máximo**).
- **20 natural**: sucesso com efeito de margem, sempre.
- **1 natural**: falha com complicação.
- Regra de ouro: pista essencial nunca fica atrás de teste. Falhar não fecha porta — complica.

## Atributos (0–5; 1 = humano comum; máx. 3 na criação)

| Atributo | Domínio | Alimenta |
|---|---|---|
| Vigor | corpo, resistência, força | PV = 20 + 5×Vigor |
| Agilidade | reflexos, coordenação | Defesa = 10 + Agilidade + equipamento |
| Intelecto | raciocínio, conhecimento | — |
| Percepção | atenção, ler cenas/pessoas | Alerta = 10 + Percepção |
| Presença | impor-se, negociar | — |
| Vontade | autocontrole | Sanidade = 10 + 5×Vontade |

- Distribuição: array `[3, 2, 2, 1, 1, 0]` (recomendado) ou 9 pontos livres, máx. 3.
- **Dial de letalidade** (sessão zero): PV = `10 | 20 | 30` + 5×Vigor. Padrão: **20**. → o app deve ter essa base configurável.

## Perícias — são 15 (Treinado +3 · Veterano +6)

| Atributo padrão | Perícias |
|---|---|
| Vigor | Atletismo, Briga |
| Agilidade | Pontaria, Furtividade, Condução |
| Intelecto | Tecnologia, Medicina, **Erudição**, Ocultismo |
| Percepção | Investigação, Intuição, Rua |
| Presença | Persuasão, Enganação, Intimidação |

⚠️ O plano original listava 14 e omitia **Erudição** — a ficha oficial tem 15.
Nenhum Antecedente concede Ocultismo. Veterano só via progressão. Criação: 2 do Antecedente + 2 livres = 4 treinadas.

## Estados derivados

- **Ferido** (PV atual ≤ metade do máx.): **-2 em testes de Vigor e Agilidade** — não é só indicador visual, aplica modificador.
- **Metade da Sanidade**: cada vez que cruza a metade do máximo **descendo** → marca 1 Trauma.
- **Exposto**: -2 na Defesa.
- **Caído**: ataques corpo a corpo contra você +2; levantar consome o Deslocamento.
- **Fora de combate** (0 PV): caído, não morto. Sem socorro morre em minutos. Medicina DT 15 estabiliza; acorda com 1 PV no fim da cena.
- **Morto** (PV atual ≤ metade do máx., em negativo — ex.: 10 PV máx. → morre em -5 ou menos): estado final, sem estabilização possível.

## Determinação

Começa cada sessão com **1**; máximo acumulável **2**.
- **Ganha**: Motivo te meteu em encrenca de verdade · pagou preço real por um Vínculo · escolheu interpretar a Resposta de um Trauma.
- **Gasta**: rerolar qualquer teste · segurar um Surto até o fim da cena (desaba depois, em segurança).

## Vínculos (máx. 2 na criação; 3 via progressão)

- Cena de Vínculo no downtime: **+1d4 Sanidade**.
- Perder um Vínculo: **-1d8 Sanidade, direto, sem teste**.

## Sanidade

Teste de Sanidade: diante de gatilho, teste de **Vontade** vs. DT da cena. **Falha: perde o valor inteiro. Sucesso: perde metade.** No app, o resultado separa **d20 + Vontade** do **dado de perda**; eles não são somados. O mestre compara o teste com a DT da cena e confirma a perda na ficha. As regras gerais de 1 e 20 naturais continuam valendo: 1 é falha com complicação, 20 é sucesso com efeito extra. O jogador vê quanto perde em cada caso e aguarda a confirmação; o rolador do jogador não desconta automaticamente.

| Gatilho | Perda |
|---|---|
| Perturbador | 1d4 |
| Horror direto | 1d8 |
| O impossível | 2d8 |

Custo da violência (sem teste, salvo indicado):

| Situação | Custo |
|---|---|
| Matar alguém | 1, automático |
| A primeira morte que você causa | teste (1d4), além do ponto |
| Ver aliado cair a 0 PV | teste (1d4) |
| Executar alguém rendido/caído | 1d8, sem teste |

## Surto

**Gatilho: perder 5 ou mais de Sanidade de uma vez → colapso imediato.**
- Role **duas vezes** na tabela; o jogador escolhe qual acontece. **Mesmo número duas vezes: "o destino insiste" — sem escolha.**
- Duração: até o fim da cena, ou **1d4+1 rodadas** em cena de ação.
- Aliado pode encerrar: ação + Presença (Persuasão) **DT 15** (Acalmar). Paranoia: DT +5.
- Ou o próprio segura com 1 Determinação (desaba depois).

### Tabela de Surto (d20) — reproduzir completa no app

| d20 | Surto | O que acontece |
|---|---|---|
| 1 | Fuga cega | Corre para longe da fonte pelo caminho mais rápido, ignorando perigos no trajeto. |
| 2 | Esconderijo | Enfia-se no menor abrigo ao alcance e não sai por vontade própria. |
| 3 | Busca por luz | Corre para o lugar mais público e iluminado que conhecer, custe o que custar à discrição. |
| 4 | Descarte | Solta tudo o que carrega — armas, provas — e foge de mãos vazias, sem notar o que ficou. |
| 5 | Congelamento | Imóvel e mudo. Não realiza ações; só volta a se mover se sofrer dano. |
| 6 | Desabamento | As pernas não obedecem: cai onde está e só se desloca rastejando. |
| 7 | Loop | Trava numa micro-ação repetida. Pode falar; não faz outra ação física. |
| 8 | Espectador | Assiste a si mesmo de fora. Só age se um aliado der instruções simples e diretas. |
| 9 | Grito | Berra sem parar. Atrai tudo por perto; nada de furtividade nem fala coerente. |
| 10 | Fúria | Avança corpo a corpo contra a fonte (ou o mais perto): +2 no dano, -2 na Defesa, não recua. |
| 11 | Demolição | Destrói o ambiente — telas, câmeras e vidros primeiro. Barulho e rastro óbvios. |
| 12 | Riso errado | Gargalhada incontrolável no tom errado. Sem fala coerente nem testes sociais. |
| 13 | Transmissão | Saca o celular e filma, posta, transmite. Mãos ocupadas e um belo rastro digital. |
| 14 | Chamada | Liga para alguém — um Vínculo, a emergência — e narra tudo em tempo real. |
| 15 | Obediência | Cumpre qualquer ordem direta dita com autoridade, venha de aliado ou inimigo. |
| 16 | Confissão | Despeja verdades. Quem mestra faz até três perguntas; a personagem responde com sinceridade. |
| 17 | Consumo | Precisa de algo que acalme e não faz mais nada até conseguir. A primeira dose encerra o Surto. |
| 18 | Paranoia | Todos são cúmplices: recusa ajuda, mantém distância dos aliados. Acalmá-lo: DT +5. |
| 19 | Eco | Sussurra tudo o que ouve com dois segundos de atraso — inclusive frases que ninguém disse. Ouvi-lo de perto por uma cena inteira custa 1 de Sanidade. |
| 20 | Sintonia | Para e escuta, imóvel, sussurrando. Ao fim do Surto, quem mestra entrega uma informação verdadeira sobre o mistério — e a personagem perde 1d4 de Sanidade. |

## Trauma

- Marca 1 Trauma cada vez que a Sanidade cruza a metade **descendo**.
- Em jogo: gatilho aparece em cena → teste de **Vontade DT 12**. Sucesso: segura. **Falha: escolhe** — perde 1d4 de Sanidade **ou** interpreta a Resposta até o fim da cena e ganha 1 Determinação.
- Traumas não saem com descanso. Com **3 ou mais**: à beira de se perder.
- **Cicatriz**: gatilho não força mais teste; **1×/sessão, +2** num teste quando o tema for relevante.

### Tabela de Traumas (d20) — reproduzir completa no app

| d20 | Trauma | Gatilho | Resposta |
|---|---|---|---|
| 1 | Hipervigilância | Câmeras; ser observado | Mapeia saídas e câmeras antes de tudo; não recupera Sanidade em local monitorado. |
| 2 | Tela quebrada | Telas com estática ou falha | Desvia os olhos; não lê nem opera telas com defeito. |
| 3 | Sirene | Alarmes, notificações em massa | Cobre os ouvidos, busca abrigo; -2 enquanto o som durar. |
| 4 | O uniforme | Um uniforme ou logotipo específico | Não fala com quem o veste; trava ou se retira. |
| 5 | Letra miúda | Contratos, assinaturas | Não assina nem concorda sob pressão; trava lendo cláusulas. |
| 6 | Cerco | Multidões | Precisa de rota de fuga à vista; cercado, -2 em tudo. |
| 7 | Sangue | Sangue, ferimentos abertos | Não usa Medicina e evita olhar ferimentos, inclusive os próprios. |
| 8 | Apagão | Queda de energia, luzes piscando | Acende qualquer luz imediatamente; não entra em área sem energia sem companhia. |
| 9 | Silêncio | Silêncio absoluto | Precisa preenchê-lo: fala, cantarola, liga algo. |
| 10 | Porta fechada | Confinamento sem janelas | Só entra com a saída à vista; confinado, -2 em tudo. |
| 11 | O nome completo | Ouvir o próprio nome completo em voz alta | Congela; pego de surpresa, perde a próxima ação. |
| 12 | Reflexo | Espelhos, a própria imagem em câmera | Evita e cobre reflexos; não usa monitoramento por câmera. |
| 13 | Frasco vazio | Farmácias, remédios | Confere os próprios reguladores compulsivamente; sem nenhum, -2 até conseguir. |
| 14 | Voz de comando | Ordens gritadas com autoridade | Obedece à primeira ordem antes de pensar (uma ação involuntária). |
| 15 | O que ficou para trás | Menção à pessoa que não foi salva | Não recua deixando alguém em perigo; assume riscos por terceiros. |
| 16 | Infraestrutura | Cabos expostos, servidores | Não toca no hardware; precisa guiar outra pessoa. |
| 17 | A voz sintética | Assistentes de voz, URAs | Responde em voz alta, sempre; não os desliga sem se despedir. |
| 18 | Retrato antigo | Registros do próprio passado | Nega: "esse não sou eu". Não confirma o próprio passado. |
| 19 | O número | O próprio registro/ID | Compulsão de riscar ou destruir o número onde aparecer. |
| 20 | Canto da estática | Qualquer manifestação estranha | Aproxima-se em vez de recuar; afastar-se exige Vontade (DT 12). |

### Superando Traumas (vira Cicatriz)

1. **Nomear**: contar a origem a um Vínculo, em cena.
2. **Encarar**: enfrentar o gatilho voluntariamente e passar (Vontade DT 12) sem Determinação.
3. **Atravessar**: gastar o Marco de Caso. Recupera 1d8 de Sanidade.

## Recuperação de Sanidade e neuro-reguladores

- Lenta: descanso + cenas de Vínculo no downtime (1d4).
- Rápida: neuro-reguladores. **Máx. 1 dose/dia** (a 2ª não recupera nada e exige Vigor DT 15 ou -1d4 PV).

| Apresentação | Recupera | Custo imediato | Telemetria |
|---|---|---|---|
| Genérico de esquina (R$ 60) | 1d4 | Vigor DT 12 ou -2 em Percepção até dormir | nenhuma — fora da rede |
| Pleno® com receita (P$ 180) | 1d8+2 | Anestesia até a próxima noite de sono | **1 Acesso** |
| Ajuste clínico (P$ 30.000 ou "coberto pelo plano") | Sanidade máxima e remove um Trauma | apaga a cadeia de memória inteira ligada ao Trauma | 3 Acessos + assina um termo |

- **Anestesia** (Pleno®, até dormir): gatilhos de Trauma passam automático mas não geram Determinação; cenas de Vínculo não recuperam Sanidade; Motivo não gera Determinação.
- **Dependência**: doses em **duas sessões consecutivas** → Dependente. Sem dose há mais de um dia: **-2 em Vontade**. Sair: uma semana limpo + uma cena de Vínculo.
- **Telemetria / Acessos**: cada dose na rede entrega localização e estado à fabricante. **O mestre anota Acessos e gasta na pior hora possível** → o app deve ter um contador de Acessos por personagem.

## Combate

- **Iniciativa**: d20 + Agilidade, **uma vez**. Empate: maior Agilidade.
- **Surpresa**: pego de surpresa não age na 1ª rodada e fica Exposto (-2 Defesa).
- **Turno**: 1 Ação + 1 Deslocamento (9 m) + interações triviais.
- **Pressionar**: troca Deslocamento por 2ª Ação → Exposto até o próximo turno.
- **Reação (1/rodada) — Proteger**: aliado adjacente (1,5 m) atingido? Troca de lugar e recebe o dano.

| Ação | Efeito |
|---|---|
| Atacar | corpo a corpo: Vigor + Briga · à distância: Agilidade + Pontaria — vs. Defesa. Margem 10+: dano máximo |
| Manobra | derrubar/desarmar/empurrar (1,5 m): Vigor + Briga vs. Defesa — sem dano; margem 10+: dois efeitos |
| Correr | +9 m |
| Mirar | +2 no próximo ataque |
| Esconder-se | Furtividade vs. Alerta; atacando escondido, alvo conta como Exposto |
| Intimidar | Presença + Intimidação vs. DT 10 + Vontade (só em quem já viu sangue) |
| Primeiros socorros | Medicina DT 15: estabiliza a 0 PV ou recupera 1d4 PV (1×/pessoa/cena) |
| Acalmar | Presença (Persuasão) DT 15: encerra o Surto de um aliado |
| Ajudar | +2 para o próximo teste de um aliado |
| Usar / interagir | tecnologia, arrombar, dirigir, improvisar |

- Corpo a corpo **soma Vigor ao dano**; arma de fogo não soma nada.
- Alcance além do listado até o dobro: -5.
- Fuga: 30 m + fora de linha de visão = venceu. Cobertura parcial: +2 Defesa contra tiros; total: não pode ser alvo.
- Recuperação de PV: 1d4 + Vigor por dia de descanso real; cuidados médicos dobram. Não existe cura em combate.

### Armas (pré-carregar no app)

| Arma | Dano | Alcance | Nota |
|---|---|---|---|
| Desarmado | 1d4 + Vigor | 1,5 m | — |
| Faca | 1d6 + Vigor | 1,5 m | fácil de esconder |
| Bastão / cassetete | 1d8 + Vigor | 1,5 m | — |
| Facão / machado | 1d10 + Vigor | 1,5 m | impossível de disfarçar |
| Taser | 1 | 1,5 m | Vigor DT 15 ou Caído e Exposto por 1 rodada |
| Pistola | 2d6 | 20 m | comum, fácil de esconder |
| Revólver | 2d6 | 20 m | robusto: ignora engasgo no 1 natural |
| Espingarda | 2d8 | 10 m | a até 3 m: +2 no dano |
| Fuzil | 2d8 | 60 m | ilegal, escandaloso |

| Proteção | Defesa | Nota |
|---|---|---|
| Colete discreto (R$ 2.500) | +1 | passa despercebido |
| Colete tático | +2 | grita "problema" |

## Dinheiro

- Início de jogo: **R$ 500 + P$ 800**.
- **P$ (Ponto®)**: moeda corporativa, toda transação registrada. **R$ (Real)**: papel, ninguém rastreia.
- Câmbio: 1 P$ = 1 R$ na fachada. P$→R$ com cambista: **-30%**. R$→P$: exige justificar origem.
- Catraca de fronteira de zona: P$ 60.

## Progressão (sem XP)

- **Marco de Caso** (fechou um caso), escolha 1: nova perícia Treinada · perícia que importou vira Veterana · novo Contato/Recurso · consolidar/substituir Vínculo (máx. 3) · Atravessar um Trauma pronto.
- **Marco de Arco** (fechou temporada): +1 atributo (máx. 4) ou dois ganhos de Caso.

## Os 8 Antecedentes (cada um: 2 perícias, 1 contato/recurso, 1 kit, 1 gancho, 1 pergunta)

| # | Antecedente | Perícias | Kit (resumo) |
|---|---|---|---|
| 1 | Segurança descartado(a) | Briga, Intimidação | pistola da empresa, colete discreto gasto, crachá desativado |
| 2 | Jornalista independente | Investigação, Persuasão | gravador analógico, credencial vencida, arquivo de matérias |
| 3 | Médico(a) de periferia | Medicina, Rua | kit médico de campo, bloco de receitas, chave de clínica improvisada |
| 4 | Hacker de infraestrutura | Tecnologia, Furtividade | laptop endurecido, ferramentas de campo, uniforme de concessionária |
| 5 | Ex-policial | Pontaria, Intuição | revólver pessoal, distintivo cancelado, algemas |
| 6 | Executivo(a) em desgraça | Enganação, Erudição | terno excelente, relógio caro, cartão cancelado + senha antiga |
| 7 | Contrabandista | Condução, Atletismo | veículo com fundo falso, chaves de 3 lugares, encomenda não entregue |
| 8 | Liderança comunitária | Persuasão, Rua | celular com "o grupo", chave do centro comunitário, caderno de favores |

(Contatos, ganchos e perguntas completos estão no PDF — o app só precisa de perícias + kit para presets de ficha.)

## Equipamento — princípios

- Itens abrem portas, não empilham bônus. Ferramenta certa: teste normal. Improvisada: DT +5. Sem ferramenta: às vezes impossível.
- Acesso: Comum · Marcado (na rede: automático + registrado; na rua: Rua/Contato DT 15) · Restrito (rua: contato + preço + DT 15–20) · Proibido.
- Etiquetas: Rastreável · Analógico · Ilegal · Óbvio.
- **A Correção**: registros digitais de anomalias somem em horas; mídia analógica preserva.

## Contexto de mundo (para microcopy da UI)

- As Quatro corporações: **Amparo Biociências** ("A gente cuida.") · **Sinal** ("Sinal limpo.") · **Sentinela Segurança & Território** ("Pode dormir.") · **Enxame** ("Todo mundo junto.").
- Geografia: o Eixo (Paulista–Faria Lima–Berrini) · o Centro (Sé, República, Luz, o Copan) · as Zonas (Capão, Grajaú, Brasilândia, Cidade Tiradentes, São Miguel) · o subterrâneo (Metrô, estações mortas, Tietê e Tamanduateí enterrados).
- A garoa continua caindo — em certas noites, ela chia.
- Tagline: *"A Estática é o mundo parado. O Ruído é o que se move por baixo."*
- Logística da mesa: online, sessões de 3–4h, voz no Discord, mapa e dados no navegador via screen share do mestre.
