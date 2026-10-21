# ADR-003 — Verificação de identidade simulada

**Status:** aceita · **Data:** 2026-10-21

## Contexto

O MVP não pode usar biometria real, câmera, imagem ou fornecedor. Ainda assim, precisa
demonstrar correspondência, não correspondência, inconclusão e indisponibilidade sem
transformar simulação em autorização.

## Decisão

- Toda verificação tem `mode=SIMULATED` e resultado no namespace `SIMULATED_*`,
  `INCONCLUSIVE`, `ERROR` ou `UNAVAILABLE`.
- `mode=REAL`, `MATCH` e `NO_MATCH` são rejeitados pela API.
- O adaptador demo pode receber um cenário explicitamente identificado como controle de
  simulação. Ele é um insumo de teste, nunca uma autorização.
- A liberação revalida estado da visita, vínculo da verificação, resultado e modo.
- `SIMULATED_MATCH` permite uma liberação lógica `AUTHORIZED`, sempre com
  `physicalAccessPerformed=false`.
- `SIMULATED_NO_MATCH` e resultados incertos geram `DENIED`, sem efeito físico.
- Se `APP_ENV=production`, a aplicação se recusa a iniciar.

## Consequências

- A demo cobre caminhos positivos e negativos sem alegar biometria real.
- O adaptador pode ser substituído no futuro sem alterar as regras de domínio.
- Nenhum texto de UI ou auditoria afirma abertura de catraca.
