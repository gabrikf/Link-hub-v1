# Baseline de produção — 2026-08-29

Capturado direto do container `crafthub-postgres` na VPS, para comparar depois da
restauração de teste. Se a restauração não reproduzir estes números, o backup não presta.

Banco: `crafthub` · usuário: `crafthub_user` · Postgres 15.19 · tamanho: **12 MB**

Extensões: `plpgsql 1.0`, `vector 0.8.6`

| tabela | linhas |
|---|---|
| activity_events | 0 |
| api_tokens | 0 |
| candidate_interactions | 0 |
| email_verification_tokens | 0 |
| git_connections | 0 |
| links | 6 |
| oauth_accounts | 2 |
| password_reset_tokens | 0 |
| posts | 0 |
| profile_blocks | 20 |
| profile_tabs | 4 |
| refresh_tokens | 2 |
| resume_embeddings | 1 |
| resume_section_embeddings | 2 |
| resume_skills | 80 |
| resume_titles | 2 |
| resumes | 1 |
| skills_catalog | 80 |
| titles_catalog | 2 |
| user_preferences | 2 |
| users | 2 |
| work_experiences | 7 |

## Fora do schema `public` — não esquecer

| tabela | linhas |
|---|---|
| drizzle.__drizzle_migrations | 24 |

Esta é a que quase escapou: minha primeira contagem só varreu `public` e achou 22 tabelas,
mas o dump cria 23. A extra é o livro-caixa de migrations do Drizzle, num schema próprio.

Ela está no dump (`CREATE SCHEMA drizzle;` mais a tabela), e precisa estar: se uma
restauração trouxer os dados sem esse registro, o Drizzle acha que nenhuma migration
rodou e tenta aplicar as 24 de novo por cima de um banco que já tem tudo.
