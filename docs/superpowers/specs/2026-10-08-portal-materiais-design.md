# Portal de materiais

Data: 2026-10-08. Estado: desenho aprovado em conversa, aguardando revisão desta spec.

## Objetivo

Dar ao Much Chat um lugar próprio para o conteúdo que as automações entregam no direct. Hoje cada
automação aponta para uma página do Notion colada à mão no campo `link`; não se sabe quem abriu, e
o material fica fora do produto.

O portal serve primeiro à @d.ia.riamente, mas nasce dentro do Much Chat com os dados separados por
conta, para abrir a outros criadores sem refazer. Mais adiante deve poder hospedar cursos.

Sucesso:

- os links das automações passam a apontar para o portal em vez do Notion;
- o funil de cada automação mostra quantas pessoas abriram o material;
- criar um material novo leva minutos, pelo painel ou pelo Claude (MCP).

## Decisões tomadas com o usuário

1. Portal dentro do Much Chat, dados por conta. Visual e domínio por criador ficam para depois.
2. Tipos de conteúdo na versão 1: páginas de texto, arquivos para baixar e listas de links.
3. Acesso por link pessoal, sem cadastro: o endereço enviado no direct identifica a pessoa.
4. Cada material é **público** (qualquer visitante abre) ou **exclusivo** (só abre por link
   pessoal). Os exclusivos aparecem trancados na biblioteca, com a chamada para comentar no post.
5. CMS como módulo do painel, com editor em blocos próprios, no padrão do construtor de automações.
6. O link rastreável faz parte deste projeto: o mesmo mecanismo do link pessoal serve para links
   externos.

Limite conhecido e aceito: o link pessoal carrega um código. Quem recebe o link repassado abre o
material e conta como a pessoa original. O portal conta aparelhos diferentes por código, o que
mostra quando um link está circulando. Controle de verdade exige login, fora desta versão.

## Fora da versão 1

Vídeo, login de visitante, cursos, captura de e-mail, domínio próprio, visual personalizado por
criador, busca e categorias na biblioteca.

## Experiência

### Visitante

- **Página do material** (`/m/{conta}/{slug}`): capa, título, descrição e os blocos em sequência.
  Feita para o celular, porque abre no navegador interno do Instagram.
- **Biblioteca** (`/m/{conta}`): materiais publicados, do mais novo para o mais antigo, com capa,
  título e descrição. Público abre direto. Exclusivo aparece trancado, com o texto "Comente
  PALAVRA neste post para receber" e o link do post, quando esses campos estiverem preenchidos.
- **Desbloqueio**: quem abriu um exclusivo pelo link pessoal continua vendo esse material aberto
  na biblioteca, no mesmo aparelho.

O portal usa a identidade atual do Much Chat, com o nome de usuário da conta (as iniciais no lugar da foto; a foto do Instagram fica como pendência).

### Criador (painel)

- Item **Materiais** no menu: lista com status, visibilidade e número de pessoas que abriram.
- **Editor**: campos do material (título, endereço, descrição, capa, visibilidade, post e palavra
  da chamada) e a pilha de blocos, com pré-visualização de celular ao lado.
- **Automação**: o campo de link passa a ter duas opções, "material do portal" (escolhido numa
  lista) ou "link externo".
- **Funil**: etapa nova "abriu o material", depois de "DM enviada".
- **Contato**: lista dos materiais que a pessoa abriu.

## Blocos

| Bloco | Conteúdo | Na página |
|---|---|---|
| Texto | Markdown simples: títulos, negrito, itálico, listas, links, citação | Texto formatado |
| Prompt | Rótulo opcional e o texto do prompt | Caixa com botão "Copiar" |
| Arquivo | Arquivo enviado, nome exibido e descrição opcional | Botão de baixar com nome e tamanho |
| Lista de links | Itens com título, descrição opcional e URL | Cartões que abrem em nova aba |
| Imagem | Imagem enviada, texto alternativo e legenda opcional | Imagem com legenda |

Limites: até 40 blocos por material; texto de até 20.000 caracteres por bloco; arquivo de até
25 MB; imagem de até 8 MB (o mesmo limite das publicações).

Os tipos e a validação ficam em `lib/material.ts`, no mesmo formato de `lib/flow.ts`: tipo
`Block`, `BLOCK_META`, `blankBlock`, `validateBlocks`. A conversão do Markdown fica em
`lib/markdown.ts`, isolada e testável, sem aceitar HTML cru e só com links `http` e `https`.

## Dados

Três tabelas no Supabase, por conta. Seguem o padrão de `scheduled_posts`: o usuário logado só lê
(política `owns_account`); gravações passam pelo servidor. `anon` não tem acesso a nenhuma.

**`materials`**

| Coluna | Observação |
|---|---|
| `id`, `account_id` | `id` uuid gerado pelo banco, como em `scheduled_posts` |
| `slug` | Único por conta; letras minúsculas, números e hífen |
| `title`, `description`, `cover_path` | Capa é um caminho no Blob |
| `blocks` | jsonb, validado no servidor |
| `visibility` | `public` ou `exclusive` |
| `status` | `draft` ou `published` |
| `cta_post`, `cta_keyword` | Opcionais; alimentam a chamada do material trancado |
| `created_at`, `updated_at`, `published_at` | |

**`material_links`** — o código pessoal.

| Coluna | Observação |
|---|---|
| `code` | Chave primária; aleatório, 12 caracteres em base62 |
| `account_id` | |
| `material_id` | Nulo quando o destino é externo |
| `target_url` | Preenchido quando o destino é externo |
| `rule_id` | Automação que gerou o link |
| `igsid`, `username` | Pessoa que recebeu |
| `created_at` | |

Único por (`account_id`, `rule_id`, `igsid`, destino): a mesma pessoa disparando a mesma automação
de novo recebe o mesmo código.

**`material_opens`** — uma linha por abertura: `code`, `opened_at`, `device` (identificador
aleatório do aparelho, vindo de um cookie; sem IP nem outro dado pessoal).

Os visitantes nunca consultam o banco. As páginas do portal são renderizadas no servidor com a
chave de serviço, por funções em `lib/portal.ts` que só devolvem materiais `published` da conta
do endereço.

## Endereços

| Rota | Função |
|---|---|
| `/m/{conta}` | Biblioteca |
| `/m/{conta}/{slug}` | Página do material |
| `/l/{code}` | Link pessoal: registra a abertura e redireciona |
| `/m/{conta}/{slug}/arquivo/{blockId}` | Download: confere o acesso e redireciona para um link assinado |

`{conta}` é o nome de usuário do Instagram guardado em `instagram_accounts.username`.

Suposição minha, a confirmar na revisão: se o criador mudar o nome de usuário no Instagram, os
endereços `/m/{conta}` antigos deixam de funcionar. Os links pessoais `/l/{code}` não são
afetados, porque não levam o nome. Não há redirecionamento do nome antigo nesta versão.

O `proxy.ts` não precisa mudar: só `/painel` exige sessão.

## Link pessoal

1. Ao enviar uma DM, o motor pede o link daquela pessoa para aquela automação
   (`personalLink` em `lib/material-links.ts`). A função cria o código ou devolve o existente.
2. `{link}` no texto e a URL do botão recebem `https://{domínio}/l/{code}`.
3. Ao abrir `/l/{code}`:
   - código inexistente: redireciona para a página inicial do site;
   - grava uma linha em `material_opens`;
   - se for a primeira abertura daquele código, soma `opened` no funil da automação;
   - destino externo: redireciona para `target_url`;
   - destino material publicado: inclui o material no cookie de desbloqueio e redireciona para
     `/m/{conta}/{slug}`;
   - material despublicado ou excluído: redireciona para a biblioteca com um aviso.

O cookie de desbloqueio guarda a lista de materiais liberados naquele aparelho, assinada com HMAC
pelo servidor (segredo em variável de ambiente nova, `PORTAL_COOKIE_SECRET`). Ninguém libera um
exclusivo editando o cookie.

`/l/{code}` tem limite de tentativas por IP, com o mecanismo de `lib/ratelimit.ts`.

## Motor das automações

- `Rule` ganha `materialId?: string`. Com ele, o destino do link é o material; sem ele, vale
  `link`, como hoje. Automações antigas não mudam.
- Em `lib/processor.ts`, os pontos que usam `ctx.rule.link` (texto da DM, URL do botão e texto do
  pedido de seguir) passam a usar o link pessoal. A simulação do painel e o modo `DRY_RUN` mostram
  o endereço do material sem criar código.
- `lib/stats.ts` ganha a etapa `opened`, que entra em `funnelStages` depois de `dm`.
- Validação: uma automação com `materialId` só pode ser ativada se o material existir e estiver
  publicado. Despublicar ou excluir um material em uso por automação ativa pede confirmação e o
  painel marca a automação com um alerta.

## Arquivos

Blob privado já existente, em `materials/{accountId}/`. `lib/media-store.ts` ganha o prefixo e a
checagem de dono para esse caminho, reaproveitando `signedUrl`.

O download passa por uma rota que confere se o material é público ou se o cookie de desbloqueio o
libera, e só então redireciona para um link assinado com validade de 5 minutos.

Ao excluir um material, seus arquivos são apagados. Ao remover um bloco de arquivo ou imagem, o
arquivo é apagado quando o material é salvo.

## Erros

- Falha ao gravar a abertura não bloqueia o visitante: ele é redirecionado normalmente e o erro
  vai para o log.
- Falha ao criar o código pessoal durante o envio da DM: o motor envia o endereço do material sem
  código (para material público) ou registra a falha na execução (para exclusivo, em que o
  endereço sem código não abriria).
- Arquivo ausente no Blob: a página mostra o bloco com o aviso "arquivo indisponível".
- Conta inexistente: página 404 do portal. Material inexistente, excluído ou em rascunho numa
  conta que existe: redireciona para a biblioteca com um aviso.

## MCP

Ferramentas novas em `lib/mcp.ts`: `list_materials`, `get_material`, `create_material`,
`update_material`, `set_material_published`. `create_automation` e `update_automation` passam a
aceitar `materialId`. Blocos de arquivo e imagem pelo MCP aceitam link `https`, com as mesmas
verificações de download que as publicações já usam.

## Testes

- Unitários: `validateBlocks`; conversão do Markdown, incluindo tentativa de HTML e de link
  `javascript:`; geração e reuso do código; assinatura e leitura do cookie de desbloqueio;
  contagem única de `opened`.
- Motor: DM com link pessoal quando há `materialId`; comportamento antigo quando só há `link`;
  bloqueio de ativação com material em rascunho.
- Isolamento: uma conta não lê, edita nem baixa material de outra (junto de
  `tests/isolation.test.ts`).
- Tudo no ambiente local com `DRY_RUN`, sem tocar a produção.

## Entrega em três etapas

Cada etapa é utilizável sozinha e tem o próprio plano de implementação.

1. **CMS e portal.** Tabela `materials`, módulo Materiais no painel, editor em blocos, upload de
   arquivos e imagens, página do material e biblioteca. Exclusivos aparecem trancados, mas ainda
   não há como abri-los; nesta etapa só os públicos são úteis. Ao fim, os links do Notion já
   podem ser trocados por endereços do portal.
2. **Link pessoal e rastreamento.** Tabelas `material_links` e `material_opens`, rota `/l/{code}`,
   cookie de desbloqueio, `materialId` na automação, etapa `opened` no funil, materiais abertos
   por contato, link externo rastreável.
3. **MCP e migração.** Ferramentas do MCP e passagem dos materiais do Notion para o portal.

## Pendências da etapa 1

- Foto do perfil no topo do portal (hoje aparecem as iniciais).
- A migração `20261008000000_materials.sql` ainda não foi executada em nenhum banco: o Docker local estava desligado durante a implementação. Rodar no ambiente local antes de aplicar em produção.
- Envio de capa, imagem e arquivo, e o download pelo portal, só podem ser conferidos em produção (o ambiente local não tem Blob).
- Arquivos enviados e trocados antes de salvar ficam órfãos no Blob (mesma pendência da limpeza periódica das publicações).
- Dois salvamentos simultâneos com o mesmo endereço: o segundo recebe uma mensagem genérica de erro em vez de "Já existe um material com esse endereço".
- Um link com crase no endereço, no bloco de Texto, gera um link malformado (sem risco de segurança).
- O nome de usuário não é único no banco: se duas contas tiverem o mesmo nome, vale a atualizada mais recentemente.
- Os achados das revisões de segurança e de texto entram aqui depois que elas terminarem.
