# ADR-001 — Stack do MVP demonstrável

**Status:** aceita · **Data:** 2026-10-21

## Contexto

O ambiente possui Node.js 22.16, npm 10.9 e Docker instalado, mas o daemon Docker está
offline. O pacote documental pede um MVP demonstrável, com backend autoritativo, três
portais e testes, sem hardware real.

## Decisão

- Monorepo com npm workspaces: `apps/api`, `apps/web`, `packages/shared`.
- API em Fastify 5 + TypeScript, executada com `tsx`.
- Web em React 19 + Vite + TypeScript.
- Contratos compartilhados em TypeScript e validação de entrada com Zod na API.
- Testes de integração com Vitest usando `app.inject`.
- Persistência em SQLite via `node:sqlite` (ver ADR-002).
- Autenticação demo por sessão opaca armazenada no banco; nenhuma senha em texto claro.
- A build web pode ser servida pela própria API para a demonstração local.

## Consequências

- Um único comando sobe API e web em desenvolvimento; a build permite demo em uma porta.
- O runtime experimental de SQLite fica isolado na camada de banco.
- A troca por PostgreSQL e por um provedor corporativo de identidade permanece possível.
- Não há dependência de Docker, Hikvision ou serviço externo para demonstrar o fluxo.
