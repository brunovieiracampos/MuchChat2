# Lembrete para quem não clicou

Data: 2026-10-05. Estado: desenho aprovado em conversa, aguardando revisão desta spec.

## Objetivo

Recuperar quem entrou no funil de uma automação e parou num botão. Serve ao objetivo de fazer a
@d.ia.riamente converter mais: hoje, quem não clica (ou clica e para na verificação de seguidor)
nunca mais recebe nada.

Sucesso: o funil de cada automação mostra quantos lembretes saíram e quantas pessoas clicaram
depois dele, para decidir se a feature compensa.

## Regras do Instagram que moldam o desenho

- A primeira DM é uma Private Reply ao comentário: só uma por comentário. Sem a pessoa interagir,
  não existe segunda DM.
- Depois de um clique (ou resposta), dá para mandar DM por 24 horas.
- Responder publicamente a um comentário não tem essa trava.

Por isso há dois lembretes, conforme a situação da pessoa quando o tempo vence:

| Situação | Lembrete |
|---|---|
| Nunca clicou (só recebeu a Private Reply) | Resposta pública no comentário |
| Clicou e parou num botão seguinte | DM com o texto do lembrete e o mesmo botão em que parou |

## Decisões tomadas com o usuário

1. Cobrir as duas situações.
2. Configuração por automação (não por bloco, não global).
3. No máximo um lembrete público e um por DM para cada comentário; um tempo único por automação:
   1h, 3h, 6h ou 12h (padrão 3h).
4. Atraso feito com um processo do Workflow por espera (mesmo mecanismo do agendamento de posts,
   funciona no plano Hobby). A lógica do lembrete fica separada do mecanismo de atraso, para trocar
   por um cron frequente quando houver plano Pro.

Suposição minha, a confirmar na revisão: lembrete **desligado** nas automações existentes e
**ligado (3h)** nas novas que tenham botão de continuar.

## Comportamento

1. Sempre que um fluxo entra em espera de clique (`status: "waiting"`), e a automação tem o
   lembrete ligado, o motor numera a espera (`wseq`, contador no estado do comentário) e agenda
   uma verificação para dali a `delayHours`.
2. Na hora, a verificação só envia se **todas** as condições valerem:
   - o estado continua `waiting`, no mesmo `waitStep`, com o mesmo `wseq` (um clique no meio do
     caminho muda o `wseq`, e a verificação antiga não faz nada);
   - a automação ainda existe, está ativa e com o lembrete ligado; o bloco ainda existe no fluxo;
   - a conta não está em pausa geral e não está em modo de teste (DRY_RUN).
3. Tipo do lembrete:
   - sem clique (`clicked` vazio): resposta pública, se ainda não saiu (`rp`);
   - com clique: DM para `igsid`, se ainda não saiu (`rd`) e se o último clique (`clickAt`) foi há
     menos de 23 horas. A DM leva o botão do bloco em espera, com o mesmo payload do botão
     original (no bloco "verificar se segue", o botão de nova tentativa se a pessoa já ouviu que
     não segue).
4. O lembrete não muda o estado do fluxo: a pessoa continua em `waiting` e, se clicar, o fluxo
   segue como hoje. Um lembrete nunca agenda outro.
5. Um clique que chega depois de um lembrete conta como "recuperado" no funil.
6. Em pausa geral, a verificação vencida é descartada (não é reagendada).

## Dados

Sem migração: a regra é um JSON em `automations.rule`.

`Rule` ganha:

```ts
reminder?: { enabled: boolean; delayHours: 1 | 3 | 6 | 12; publicText: string; dmText: string };
```

Textos padrão:
- público: `{usuario}, seu material está te esperando no direct 👀 Se não aparecer, olha na pasta Solicitações.`
- DM: `Ainda dá tempo! É só tocar no botão aqui embaixo para continuar 👇`

Limites: público até 300 caracteres (o das respostas públicas); DM até 640 (mensagem com botão).
`{usuario}` e `{link}` valem como nos outros textos.

Estado do comentário no Redis (`c:{id}`) ganha: `wseq` (número da espera), `clickAt` (momento do
último clique), `rp` e `rd` (lembrete público / por DM já enviado).

## Componentes

- **`lib/flow.ts`**: tipo e padrões do lembrete, validação dos textos, `hasWaitingStep(steps)`.
- **`lib/reminder.ts`** (novo): `sendReminder(commentId, wseq, deps)`. Carrega o estado sob o mesmo
  bloqueio do motor (`lock:{id}`), aplica as condições acima, envia, marca `rp`/`rd`, registra no
  log e conta no funil. Devolve o que fez (`"public" | "dm" | "skipped"`). Não sabe nada de Workflow.
- **`workflows/flow-reminder/`** (novo): `reminderWorkflow(accountId, commentId, wseq, delayMs)`:
  dorme e chama uma etapa que entra na conta e executa `sendReminder`. Até 3 tentativas em erro
  temporário; erro permanente ou última tentativa viram um registro `reminder-failed`, sem mudar
  o fluxo.
- **`lib/processor.ts`**: (a) ao entrar em espera, incrementa `wseq` e chama a dependência nova
  `scheduleReminder(commentId, wseq, delayMs)` quando a automação tem lembrete ligado e ainda há
  lembrete possível; (b) no clique, grava `clickAt` e, se `rp` ou `rd` estiver marcado, conta
  "recuperado". Falha ao agendar não trava o fluxo (só registra no console).
- **`lib/stats.ts` e `lib/activity.ts`**: etapas novas `reminded` e `recovered`; eventos novos
  `reminder-public`, `reminder-dm`, `reminder-failed` com os textos "Lembrete público enviado",
  "Lembrete enviado no direct", "Lembrete não enviado".
- **`lib/automation-input.ts`, `lib/automations.ts`**: o lembrete passa pelo formulário,
  normalização e validação (textos obrigatórios e dentro do limite quando ligado; tempo entre os
  quatro valores).
- **Construtor (`app/painel/automacoes/builder.tsx`)**: seção "Lembrete" com liga/desliga, tempo
  e os dois textos; desabilitada com explicação quando o fluxo não tem botão de continuar. O teste
  na tela mostra uma nota com o lembrete que sairia.
- **Página da automação**: linha "Lembretes: N enviados · M voltaram" no funil.
- **MCP (`lib/mcp.ts`)**: `create_automation` e `update_automation` aceitam `reminder`;
  `get_automation` mostra a configuração e os dois contadores.

## Erros

- Erro temporário da Meta: a etapa do Workflow repete (até 3 vezes).
- Erro permanente (comentário apagado, janela fechada, permissão): registra `reminder-failed` com
  o motivo e encerra. O fluxo continua em espera.
- Comentário bloqueado por outro processamento na hora: a etapa falha e repete.

## Testes

Unitários (Vitest, dependências trocadas como em `tests/processor.test.ts`):

- nunca clicou → resposta pública com o nome da pessoa; marca `rp`; conta `reminded`;
- clicou e parou → DM com o botão certo; marca `rd`;
- clicou antes do tempo → nada sai (`wseq` diferente);
- não repete o mesmo tipo; pode sair um público e depois uma DM no mesmo comentário;
- pausa geral, DRY_RUN, automação desligada, lembrete desligado, bloco removido → nada sai;
- último clique há mais de 23h → DM não sai;
- motor: entrar em espera agenda com o `wseq` certo; sem lembrete ligado, não agenda;
  clique depois de lembrete conta `recovered`;
- validação: textos vazios ou longos demais com o lembrete ligado.

Local: ambiente de desenvolvimento em modo de teste (nada vai ao Instagram).
Real: só com autorização do usuário, comentando com uma segunda conta num post do perfil.

## Fora desta entrega

- Horário silencioso (um comentário à meia-noite gera lembrete às 3h).
- Variações do texto público. Risco conhecido: respostas idênticas em muitos comentários podem
  parecer spam para o Instagram; o nome da pessoa é a única variação.
- Teto de lembretes por post. Um processo por comentário em espera é irrelevante no volume atual;
  o custo num post viral não foi medido.
- Sequência de vários lembretes por parada.
