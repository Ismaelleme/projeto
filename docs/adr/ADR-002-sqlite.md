# ADR-002 — SQLite local para o MVP

**Status:** aceita · **Data:** 2026-10-21

## Contexto

O Docker está instalado, porém o daemon não está disponível no ambiente de
desenvolvimento. O MVP precisa persistir solicitações, decisões, verificações,
liberações, idempotência e auditoria de forma transacional.

## Decisão

Usar `node:sqlite` (`DatabaseSync`) com um arquivo local em `data/` ou banco em memória
nos testes. O acesso fica concentrado em `apps/api/src/db.ts` e nas funções de domínio.

## Consequências

- A demo não depende de serviço externo e inicia rapidamente.
- Transações síncronas atendem ao volume de demonstração.
- O módulo é experimental no Node 22; a execução emite aviso, suprimido nos scripts.
- Recursos de produção como réplica, backup gerenciado, criptografia em repouso e alta
  disponibilidade não estão cobertos. A evolução para PostgreSQL exige nova decisão.
- O arquivo do banco é ignorado pelo Git e contém apenas dados sintéticos.
