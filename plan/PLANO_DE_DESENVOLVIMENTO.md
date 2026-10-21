# Plano de desenvolvimento — Controle de Visitas Usina Lins

**Versão:** 1.0 · **Data:** 2026-10-21 · **Status:** EM EXECUÇÃO
**Base:** pacote documental `controle-visitas-usina-lins` v0.1.0 (revisado)

## 1. Objetivo

Construir um MVP demonstrável de ponta a ponta para o fluxo:

```text
visitante solicita → analista decide → portaria confere → liberação virtual simulada
```

O sistema deve provar a arquitetura, as regras de segurança e a experiência dos três
portais sem usar dados reais, hardware, biometria real, Hikvision ou abertura física.

## 2. Limites explícitos

- Ambiente identificado como `DEMO`; toda verificação é `SIMULATED`.
- Nenhuma imagem é coletada ou armazenada.
- Nenhum RG é solicitado.
- Nenhum comando é enviado a catraca, controlador ou dispositivo de rede.
- `physicalAccessPerformed` é sempre `false`.
- O backend é a única autoridade de decisão; a UI nunca envia `authorized` ou `actorId`.
- Dados de seed e formulários são sintéticos. A UI alerta para não inserir dados reais.
- O modo simulado não inicia se `APP_ENV=production`.
- Retenção, biometria real, exceções e integração física permanecem pendentes de decisão.

## 3. Stack e arquitetura

| Camada | Escolha | Justificativa |
|---|---|---|
| Runtime | Node.js 22 + TypeScript | Disponível no ambiente; suporte a `node:sqlite`. |
| API | Fastify 5 | Baixo overhead, hooks, injeção de requisições para testes. |
| Persistência | SQLite via `node:sqlite` | Docker está offline; permite demo local sem serviço externo. |
| Web | React 19 + Vite | Três portais responsivos em uma SPA tipada. |
| Contratos | Tipos compartilhados + Zod na API | Fonte única para estados e DTOs. |
| Testes | Vitest + `app.inject` | Testes de integração da API sem abrir porta. |
| Monorepo | npm workspaces | `apps/api`, `apps/web`, `packages/shared`. |

```text
apps/
  api/       Fastify, SQLite, autenticação, regras e auditoria
  web/       React SPA (visitante, análise, portaria, auditoria)
packages/
  shared/    tipos, enums e rótulos
docs/adr/    decisões arquiteturais
plan/        este plano
data/        banco local (não versionado)
```

## 4. Modelo mínimo

- `users`, `sessions`: autenticação demo com quatro papéis.
- `visitor_profiles`: nome, empresa, contato, hash do CPF e dois últimos dígitos.
- `visit_requests`: código público, estado, versão e dados operacionais mínimos.
- `visit_decisions`: decisão imutável com autor, versão e correlação.
- `identity_checks`: tentativa simulada imutável; não altera a visita.
- `virtual_releases`: decisão lógica, modo, idempotência e `physicalAccessPerformed=false`.
- `idempotency_records`: replay seguro e detecção de payload divergente.
- `audit_events`: eventos redigidos, com ator, alvo, resultado e correlação.

CPF completo não é persistido. A API guarda HMAC e os dois últimos dígitos apenas para
mascaramento. Nenhum log ou resposta devolve o CPF completo.

## 5. Fases

### Fase 0 — Fundação

- Plano, ADRs, `.gitignore`, workspaces e dependências.
- Scripts de desenvolvimento, teste, typecheck e build.

### Fase 1 — Núcleo da API

- Banco, migrations idempotentes, seed sintético, autenticação por sessão.
- Envelope de erro, correlação, cabeçalhos de segurança e rate limit de login.

### Fase 2 — Fluxo do visitante

- Criação com `Idempotency-Key`, CPF válido, sem RG e com aviso de privacidade demo.
- Listagem e detalhe apenas das próprias solicitações.

### Fase 3 — Decisão interna

- Fila com dados mínimos, decisão atômica com versão esperada.
- Aprovação/rejeição, auditoria e conflito concorrente.

### Fase 4 — Portaria e liberação

- Lista de visitas aprovadas, detalhe operacional e busca por código.
- Verificação `SIMULATED` com adaptador demo.
- Liberação virtual idempotente, revalidação completa e negação segura.
- Bloqueio de `mode=REAL` e de segunda liberação autorizada.

### Fase 5 — Auditoria

- Consulta restrita ao papel `AUDITOR`.
- A própria consulta é auditada. Metadados sem PII, imagem ou token.

### Fase 6 — Experiência web

- Login com contas demo, shell responsivo e aviso de simulação.
- Portal do visitante, central de análise, portaria mobile e auditoria.
- Acessibilidade: labels, foco visível, contraste, texto além de cor e `aria-live`.

### Fase 7 — Qualidade

- Testes de integração cobrindo caminho feliz, autorização, estados, idempotência,
  simulação, negação, auditoria e ausência de CPF completo.
- Typecheck, build e smoke test no navegador.

### Fase 8 — Publicação

- README, `.env.example`, script de demo e evidências.
- Commit e push para o repositório GitHub existente.

## 6. Contas demo

| Papel | E-mail | Senha | Acesso |
|---|---|---|---|
| Visitante | `visitante@demo.local` | `Demo@1234` | Criar e acompanhar visitas. |
| Analista | `analista@demo.local` | `Demo@1234` | Fila e decisões. |
| Portaria | `portaria@demo.local` | `Demo@1234` | Conferência e liberação simulada. |
| Auditor | `auditor@demo.local` | `Demo@1234` | Eventos de auditoria. |

## 7. Critérios de conclusão

- Fluxo completo executado com dados sintéticos.
- Estados inválidos e liberação sem correspondência negados no backend.
- Repetição idempotente devolve o mesmo resultado; payload divergente gera conflito.
- Toda liberação tem `mode=SIMULATED` e `physicalAccessPerformed=false`.
- Auditoria registra criação, decisão, verificação, liberação e consulta de auditoria.
- `npm run check` passa (typecheck + testes + build).
- App abre no navegador e os quatro perfis funcionam.
- Nenhum segredo, CPF completo, imagem ou dependência de hardware no repositório.

## 8. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| `node:sqlite` ainda experimental | Uso restrito ao demo; camada de banco isolada; troca por Postgres prevista. |
| Banco local conter PII de teste | Apenas dados sintéticos; CPF não persiste; `data/` ignorado. |
| UI parecer autorizar acesso físico | Texto fixo “simulado” e “sem abertura física”; API sempre `false`. |
| Cliente tentar forçar decisão | Nenhum campo de autorização aceito; revalidação no backend. |
| Reuso de chave com payload diferente | Hash do payload + resposta armazenada + `IDEMPOTENCY_CONFLICT`. |
| Escopo crescer para hardware real | ADR e README bloqueiam explicitamente; nenhum SDK ou endpoint físico. |

## 9. Fora do escopo

Integração Hikvision, catraca física, biometria real, upload de imagens, exceção
operacional, gestão de papéis, expiração por janela, MFA corporativo, PostgreSQL,
retenção automática e declaração de conformidade LGPD.
