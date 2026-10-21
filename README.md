# Controle de Visitas Externas — Usina Lins

MVP demonstrativo do fluxo:

```text
visitante solicita → analista decide → portaria confere → liberação virtual simulada
```

O projeto existe para validar arquitetura, regras de segurança e experiência dos portais
**sem** dados reais, biometria, imagens, Hikvision, catraca, relé ou qualquer acesso
físico. Toda verificação é `SIMULATED` e `physicalAccessPerformed` é sempre `false`.

## Limites explícitos

- Uso exclusivo com dados sintéticos. Não informe dados pessoais reais.
- Nenhum RG, imagem, selfie ou biometria real é solicitado, coletado ou armazenado.
- O CPF é validado no backend e persistido apenas como HMAC + dois últimos dígitos.
- Nenhum SDK, webhook ou comando Hikvision é usado.
- A liberação é apenas um registro lógico no backend; nenhum equipamento é acionado.
- A aplicação recusa iniciar com `APP_ENV=production`.
- A UI nunca envia `authorized`, `actorId` ou decisão de identidade; o backend revalida
  estado, versão, vínculo da conferência e idempotência.

## Stack

| Camada | Tecnologia |
|---|---|
| Monorepo | npm workspaces |
| API | Node.js 22, TypeScript, Fastify 5, Zod |
| Persistência | SQLite via `node:sqlite` (`DatabaseSync`) |
| Web | React 19, Vite 8, React Router 7 |
| Testes | Vitest com `app.inject` (integração sem abrir porta) |
| Contratos | Tipos e rótulos compartilhados em `packages/shared` |

```text
apps/
  api/       Fastify, SQLite, autenticação, regras, idempotência e auditoria
  web/       SPA responsiva com portais de visitante, análise, portaria e auditoria
packages/
  shared/    tipos, enums, DTOs e rótulos
docs/adr/    decisões arquiteturais
plan/        plano de desenvolvimento
data/        banco local (não versionado)
```

## Requisitos

- Node.js `>= 22.16` (necessário para `node:sqlite`, `loadEnvFile` e `--watch`).
- npm 10 ou superior.

No Windows PowerShell deste ambiente, `npm` pode falhar por Execution Policy do
`npm.ps1`. Use `npm.cmd`.

## Como rodar

```powershell
npm.cmd install
npm.cmd run demo
```

`demo` gera a build da web e sobe a API em `http://127.0.0.1:3000`, servindo a SPA no
mesmo endereço.

Para desenvolvimento com recarregamento:

```powershell
npm.cmd run dev
```

A API fica em `http://127.0.0.1:3000` e o Vite em `http://127.0.0.1:5173`.

Copie `.env.example` para `.env` se quiser fixar `CPF_HASH_SECRET`. Sem isso, a API
gera um segredo efêmero a cada início e avisa no log.

## Contas demo

| Papel | E-mail | Senha | Acesso |
|---|---|---|---|
| Visitante | `visitante@demo.local` | `Demo@1234` | Criar e acompanhar solicitações. |
| Analista | `analista@demo.local` | `Demo@1234` | Fila, detalhe e decisão. |
| Portaria | `portaria@demo.local` | `Demo@1234` | Conferência simulada e liberação virtual. |
| Auditoria | `auditor@demo.local` | `Demo@1234` | Consulta da trilha de auditoria. |

O seed cria três visitas sintéticas: duas aguardando análise e uma já aprovada para
testar a portaria imediatamente.

## Roteiro de demonstração

1. Entre como visitante, use **Preencher exemplo**, aceite o aviso e envie a solicitação.
2. Saia e entre como analista; abra a solicitação na fila e clique em **Aprovar visita**.
3. Saia e entre como portaria; busque pelo código `VIS-...`, registre a conferência
   simulada e solicite a liberação virtual.
4. Saia e entre como auditoria; confira os eventos de criação, decisão, conferência,
   liberação e consulta auditada.

## API principal

| Método e rota | Papel | Função |
|---|---|---|
| `GET /health` | público | Saúde, modo simulado e `physicalAccessPerformed=false`. |
| `GET /ready` | público | Prontidão com verificação do banco. |
| `GET /api/v1/public/config` | público | Modo, versão do aviso e limites. |
| `POST /api/v1/auth/login` | público | Sessão opaca com rate limit. |
| `GET /api/v1/auth/me` | autenticado | Usuário da sessão. |
| `POST /api/v1/auth/logout` | autenticado | Encerra a sessão. |
| `POST /api/v1/visitor/requests` | visitante | Cria solicitação com `Idempotency-Key`. |
| `GET /api/v1/visitor/requests` | visitante | Lista apenas as próprias solicitações. |
| `GET /api/v1/visitor/requests/:id` | visitante | Detalhe da própria solicitação. |
| `POST /api/v1/visitor/requests/:id/cancel` | visitante | Bloqueado até definição de política. |
| `GET /api/v1/internal/visit-requests` | analista | Fila de análise. |
| `GET /api/v1/internal/visit-requests/:id` | analista | Detalhe com histórico de decisões. |
| `POST /api/v1/internal/visit-requests/:id/decisions` | analista | Decisão com `expectedVersion`. |
| `GET /api/v1/internal/audit-events` | auditoria | Trilha redigida e filtros. |
| `GET /api/v1/gate/visits` | portaria | Visitas aprovadas elegíveis. |
| `POST /api/v1/gate/visits/lookup` | portaria | Busca por código. |
| `POST /api/v1/gate/visits/:id/identity-checks` | portaria | Conferência `SIMULATED`. |
| `POST /api/v1/gate/virtual-releases` | portaria | Liberação virtual idempotente. |

## Scripts

| Comando | O que faz |
|---|---|
| `npm.cmd run demo` | Build da web e início da API com SPA no mesmo host. |
| `npm.cmd run dev` | API e Vite em paralelo. |
| `npm.cmd run build` | Typecheck e build de produção da web. |
| `npm.cmd run start` | Inicia a API (usa a build existente da web). |
| `npm.cmd test` | Testes de integração da API. |
| `npm.cmd run typecheck` | Typecheck de todos os workspaces. |
| `npm.cmd run check` | Typecheck + testes + build. |

## Segurança e privacidade

- Sessões opacas com token hasheado; senhas com `scrypt` e salt por usuário.
- CPF: validação de dígitos no backend, HMAC com segredo local e máscara `***.***.***-NN`.
- Respostas, logs e auditoria não contêm CPF completo, token ou payload sensível.
- Cabeçalhos `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` e
  `Permissions-Policy`; cache desabilitado nas rotas de API.
- Correlação por requisição (`X-Correlation-Id`) e auditoria de todo evento crítico.
- Idempotência: mesma chave + mesmo payload devolve o mesmo resultado; payload
  divergente gera `IDEMPOTENCY_CONFLICT`.
- Direção autorizada: `SIMULATED_MATCH` autoriza; `SIMULATED_NO_MATCH`, `INCONCLUSIVE`,
  `ERROR` e `UNAVAILABLE` negam. `mode=REAL` é rejeitado com `MODE_NOT_ALLOWED`.

## Testes e evidências

O teste de integração em `apps/api/test/flow.test.ts` cobre:

- saúde, modo simulado e bloqueio de produção;
- autenticação, autorização por papel e rate limit de login;
- criação com idempotência, conflito de payload, CPF inválido e aviso obrigatório;
- isolamento entre visitantes e cancelamento bloqueado;
- decisão com versão esperada e transição inválida;
- conferência simulada, liberação idempotente, negação e revalidação de estado;
- auditoria sem CPF completo e consulta auditada.

Validação executada neste incremento:

- `npm.cmd run typecheck`: aprovado nos três workspaces.
- `npm.cmd test`: 16 testes aprovados.
- `npm.cmd run build`: build de produção da web gerada com sucesso.
- Smoke test real com navegador (Edge headless): login dos quatro perfis, criação,
  aprovação, conferência, liberação autorizada, auditoria e rota 404, sem erros de
  console e sem overflow horizontal em 390px.

## Fora do escopo

Integração Hikvision, catraca física, biometria real, upload de imagens, exceção
operacional, gestão de papéis, expiração por janela, MFA corporativo, PostgreSQL,
retenção automática e declaração de conformidade LGPD.

`node:sqlite` é experimental no Node 22 e aparece um aviso no console; o uso está
restrito a esta demonstração local.
