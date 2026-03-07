# Relatório de status — Certificado Digital + Captura de Processos (Luciano / Tenant Sandra)

## Objetivo avaliado
Medir o nível de implementação do fluxo principal:
1. Advogado consegue subir e validar certificado digital A1 no sistema.
2. Sistema consegue trazer os processos do advogado (idealmente “todos”).

## Resultado resumido em porcentagem
- **Upload/gestão de certificado A1:** **95%**
- **Teste técnico do certificado no sistema:** **85%**
- **Captura de processos por OAB (e-SAJ):** **60%**
- **Captura via PJe com certificado para “todos os processos”:** **35%**
- **Persistência + sincronização automática contínua:** **55%**

### Percentual consolidado do carro-chefe
Considerando o fluxo ponta a ponta (certificado + trazer todos os processos com confiabilidade de produção):
- **Status atual estimado: 58%**

## Evidências do repositório

### O que já está forte
- Upload, criptografia, ativação/desativação e logs de certificado estão implementados em server actions.
- Existe validação do PKCS#12 (incluindo fallback para certificado legado) e teste de conexão do certificado.
- A captura jurídica já tenta inferir OAB do advogado logado e sincroniza processos/movimentações capturados com a base.
- O scraping e-SAJ possui busca por OAB com paginação e limite de processos.

### Principais lacunas para chegar em 90%+
- Integração PJe de consulta processual ainda está parcialmente stubada (autenticação e consulta real com TODOs).
- Cron Comunica atualmente registra payload bruto em auditoria, sem pipeline completo de normalização e vinculação de todos os processos ao advogado.
- Dependências operacionais externas (captcha e georestrição) ainda afetam “trazer todos os processos” de forma automática.

## Plano para avançar

### Fase 1 — Fechar fluxo PJe real (prioridade máxima)
1. Implementar autenticação real no módulo `lib/api/juridical/pje.ts`.
2. Implementar endpoint de consulta/listagem de processos por advogado/OAB no PJe.
3. Persistir retorno normalizado em tabelas de domínio (não só audit log).

### Fase 2 — Robustez de captura em escala
1. Pipeline idempotente para sincronização incremental (novos/atualizados).
2. Tratamento de captcha e fallback operacional para consultas por OAB.
3. Jobs com retry/backoff e observabilidade de falhas por tribunal.

### Fase 3 — Operação no tenant Sandra com usuário Luciano
1. Definir política de certificado (OFFICE/HYBRID/LAWYER) adequada ao cenário do Luciano.
2. Subir certificado do Luciano e validar teste técnico.
3. Rodar captura por OAB e medir cobertura real de processos retornados.
4. Ajustar limites, retries e tribunais prioritários até atingir cobertura-alvo.

## Critério de pronto sugerido
Considerar “carro-chefe pronto para produção” quando:
- certificado for validado e utilizado sem intervenção manual;
- captura por OAB/PJe trouxer processos com cobertura alta e estável;
- sincronização incremental funcionar automaticamente (cron/worker);
- erros de tribunal/captcha tiverem fallback e monitoramento.
