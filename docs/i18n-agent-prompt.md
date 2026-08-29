# Prompt: adicionar i18n ao CraftHub

Cole o bloco abaixo numa **sessão nova do Claude Code** neste repositório, com o
modelo em **Opus**. Ele orquestra; os subagentes rodam em Sonnet.

## Antes de colar, duas decisões

**1. Em qual branch?** A `nightly/qa-hardening` tem 109 commits autônomos ainda
não revisados. Misturar i18n com eles torna os dois diffs impossíveis de revisar
separadamente. A recomendação é sair de `develop`:

```bash
git checkout develop && git checkout -b feat/i18n
```

**2. Idioma no banco ou no localStorage?** O prompt trata isso como duas fases,
com a fase 2 opcional. Leia a seção "Persistência" antes de decidir.

---

```
Adicione i18n ao apps/web do CraftHub. Você é o orquestrador: fanout agressivo
para subagentes Sonnet, e você (Opus) fica com o que exige julgamento.

LEIA PRIMEIRO, NESTA ORDEM — não pule:
  cat .claude/skills/i18n/SKILL.md          # o contrato desta migração
  cat AGENTS.md                             # a lei do projeto
  cat scripts/guardrails/i18n-parity.mjs    # o teste que JÁ existe

A skill i18n não é sugestão: ela define a biblioteca (react-i18next), os três
locales (pt-BR, en-US, es-ES), a estrutura de pastas, e — o mais importante —
as REGRAS DE NOMENCLATURA DE CHAVE. Siga-as literalmente. Elas são a diferença
entre 200 chaves reutilizáveis e 2000 duplicadas.

Consulte o context7 antes de escrever o init do react-i18next. A API mudou entre
majors e um exemplo lembrado de memória estará errado.

════════════════════════════════════════════════════════════════════
O RISCO CENTRAL, E COMO O FANOUT DEVE SER ESTRUTURADO
════════════════════════════════════════════════════════════════════

Se você mandar 10 subagentes extrairem strings e escreverem chaves ao mesmo
tempo, você recebe 10 dialetos: `save`, `saveButton`, `common.save`,
`profile.saveLabel` — todos para a palavra "Save". Isso é irreversível na
prática e destrói o valor do trabalho.

Então faça em DUAS PASSADAS, com a deduplicação no meio, feita por você:

PASSADA 1 — INVENTÁRIO (subagentes Sonnet, SOMENTE LEITURA)
  Um subagente por feature. As features são:
    auth, dashboard, posts, profile, profile-layout, resume, resume-import,
    search, settings, work-history
  Mais um para shared-components/ e um para lib/ + App.tsx + router.tsx.
  São 12 subagentes, e eles rodam em paralelo.

  Cada um recebe: "Liste TODA string visível ao usuário no seu diretório. NÃO
  edite nada. Para cada uma devolva: arquivo:linha, o texto exato em inglês, e
  uma chave PROPOSTA seguindo as regras da skill i18n (nomeie por significado,
  nunca por local). Inclua placeholders de formulário, aria-labels, títulos,
  mensagens de erro, textos de botão, estados vazios e textos de confirmação.
  NÃO inclua: nomes de rota, chaves de query, testids, nomes de classe CSS,
  nem strings que só aparecem em console.error ou em comentário."

  Devolva como JSON para você poder mesclar por programa, não por leitura.

VOCÊ (Opus) — CANONIZAÇÃO
  Junte os 12 inventários. Este é o passo que só você faz:
    - Agrupe por TEXTO idêntico. "Save" aparecendo em 6 telas é UMA chave.
    - Decida o namespace: `common.*` para o que é genuinamente reutilizável,
      `<feature>.*` só quando o texto é específico do domínio e ambíguo sozinho.
    - Escreva os três arquivos de locale você mesmo, com o mapa canônico.
      pt-BR e es-ES traduzidos de verdade; en-US é a fonte.
    - Publique o mapa canônico (texto → chave) num arquivo que a passada 2 lê.

PASSADA 2 — APLICAÇÃO (subagentes Sonnet, escrevendo)
  Os mesmos 12 recortes, agora escrevendo. Cada um recebe o mapa canônico e a
  instrução: "Troque cada string do seu diretório pela chave do mapa. Se
  encontrar uma string que não está no mapa, NÃO invente chave — pare e
  reporte. Adicione useTranslation onde precisar. Não mude lógica, não
  reformate, não 'melhore' nada além da troca."

  Um subagente por vez pode tocar cada arquivo — os recortes não se sobrepõem,
  então rode todos em paralelo.

════════════════════════════════════════════════════════════════════
O QUE VOCÊ MESMO FAZ
════════════════════════════════════════════════════════════════════

1. `apps/web/src/i18n/index.ts` — o init. fallbackLng "en-US", supportedLngs com
   os três, returnNull: false (chave faltando renderiza a chave, não vazio).
   Importado uma vez de main.tsx.

2. **Atualizar `<html lang>` quando o idioma muda.** Hoje está fixo em "en" no
   index.html. Deixar obsoleto é defeito de acessibilidade real — leitores de
   tela tiram a pronúncia dali.

3. **O seletor de idioma na navbar**, minimalista. Procure como a navbar já
   trata o botão de tema e siga o mesmo peso visual — não invente um padrão
   novo. Use os constants de `apps/web/src/shared-components/surface.ts`; o
   DESIGN.md proíbe escrever essas class strings à mão. Todo utilitário de cor
   precisa do par `dark:`.

4. **O teste rápido** — seção própria abaixo.

5. Os três arquivos de locale, com o mapa canônico.

════════════════════════════════════════════════════════════════════
PERSISTÊNCIA — leia antes de decidir
════════════════════════════════════════════════════════════════════

FASE 1 (faça sempre): persista em localStorage, ao lado de `crafthub-theme`.
`apps/web/src/lib/theme.ts` já é exatamente esse padrão — copie a forma dele.
Zero risco de banco, e entrega o recurso inteiro.

FASE 2 (só depois da fase 1 verde, e só se você julgar seguro): mover para
preferências do usuário no banco.

  O QUE ISSO CUSTA DE VERDADE, verificado no repositório:
    - `users` NÃO tem coluna de idioma. Precisa de migração Drizzle.
    - `theme_accent` e `theme_preset` que existem na tabela são do PERFIL
      PÚBLICO (o visual da página compartilhada), NÃO do modo claro/escuro do
      app. Não reaproveite: são outra coisa.
    - O modo claro/escuro do app hoje vive só em localStorage.
    - Existe `app.put("/me")` em profile-controller.ts e `profileSchema` em
      @repo/schemas — é por aí que a coluna nova entra.
    - Contrato primeiro: mude packages/schemas, rode `npm run build:schemas`,
      depois a api, depois o web. AGENTS.md é explícito nisso.

  Se fizer, faça em commits separados da fase 1, para que a migração possa ser
  revertida sozinha.

  O TEMA no banco: só faça se a fase 2 do idioma sair limpa. É o mesmo desenho
  repetido. Se qualquer coisa na fase 2 ficar arrastada, PARE e deixe o tema
  como está — o usuário disse explicitamente que isso é aceitável, e um tema em
  localStorage funcionando vale mais que um tema no banco meio pronto.

════════════════════════════════════════════════════════════════════
O TESTE RÁPIDO — escreva você (Opus), não um subagente
════════════════════════════════════════════════════════════════════

Metade já existe: `scripts/guardrails/i18n-parity.mjs` roda no gate hoje como
no-op e passa a valer no dia em que o primeiro locale aparecer. Ele já cobre
paridade de chaves, valor vazio e JSON inválido. LEIA antes de escrever
qualquer coisa — não duplique o que ele faz.

O que falta é o outro lado: **texto cru que deveria ter virado chave**. Escreva
`scripts/guardrails/i18n-raw-strings.mjs` que varre `apps/web/src/**/*.tsx` e
falha ao achar texto visível fora de `t()`.

  Onde procurar: nós de texto em JSX, e os atributos `placeholder`, `title`,
  `alt`, `aria-label`.
  O que NÃO é achado: nomes de rota, chaves de query, testids, classes CSS,
  imports, comentários, `console.*`, e arquivos `*.test.tsx`.
  Heurística mínima para reduzir falso positivo: só acuse texto com ao menos
  duas letras e um espaço, ou que comece com maiúscula.

  Cada achado precisa imprimir arquivo:linha e o texto. Um erro que não diz onde
  está custa mais que o bug.

  Sobre os 10–15 segundos que o usuário pediu: isso é folgado. São 88 arquivos
  .tsx; uma varredura por regex resolve em menos de 1 segundo, e a paridade é
  instantânea. Não use AST se regex resolver — mas se o regex gerar falso
  positivo demais, prefira acertar em vez de ser rápido, porque um teste que
  grita errado é desligado em uma semana.

  Adicione ambos ao gate e ao package.json como `npm run i18n:check`.

════════════════════════════════════════════════════════════════════
COMO SABER QUE FUNCIONOU
════════════════════════════════════════════════════════════════════

  npm run build:schemas
  npm run i18n:check
  node scripts/guardrails/pre-push.mjs        # tem que sair "guardrails PASS"

E olhe com os olhos, nos três idiomas — um app traduzido que não foi visto é um
app com layout quebrado em duas línguas:

  npm run visual:run -- scripts/visual/scenarios/public-profile.scenario.mjs

Alemão e português são mais longos que inglês; procure botão estourando e texto
truncado. Verifique os dois temas.

Se as portas 5173/3333 estiverem ocupadas por outro projeto (acontece nesta
máquina), o CraftHub sobe assim:
  PORT=3344 WEB_APP_URL=http://localhost:5273 npm run dev --workspace=api
  VITE_API_URL=http://localhost:3344 npm run dev --workspace=web -- --port 5273 --strictPort
  export E2E_API_URL=http://localhost:3344 E2E_WEB_URL=http://localhost:5273
  npx playwright test --project=desktop

════════════════════════════════════════════════════════════════════
REGRAS QUE NÃO DOBRAM
════════════════════════════════════════════════════════════════════

- Toda chave existe nos TRÊS locales no mesmo commit. Uma chave que só existe em
  um é um bug esperando um usuário com outro idioma no navegador.
- Nunca concatene frase a partir de fragmentos. Ordem de palavras e plural mudam
  por idioma. Escreva a frase inteira com a variável interpolada.
- Reutilize antes de criar: procure pelo TEXTO no locale antes de inventar
  chave.
- Não mude o valor de uma chave existente sem procurar todos os usos.
- Não toque em código de produção fora do escopo da troca de string.
- Se um subagente encontrar um bug de produto no caminho, ele REPORTA, não
  conserta. Esta tarefa é i18n.
```
