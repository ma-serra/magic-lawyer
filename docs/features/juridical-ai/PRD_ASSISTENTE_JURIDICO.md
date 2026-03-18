# PRD – Assistente Jurídico Proativo

> Documento mantido como registro histórico. O documento mestre ativo desta frente passou a ser [ATA_ASSISTENTE_JURIDICO_PROATIVO.md](./ATA_ASSISTENTE_JURIDICO_PROATIVO.md).

Status: Planejado e iniciado  
Produto: Magic Lawyer  
Última atualização: 16 de março de 2026

---

## 1. Resumo executivo

O Magic Lawyer terá um **Assistente Jurídico Proativo** como camada premium do produto.

Essa experiência deve permitir:

- gerar peças;
- analisar documentos;
- pesquisar jurisprudência;
- validar citações;
- resumir processos;
- sugerir estratégia;
- operar com memória por caso;
- oferecer insights processuais proativos.

A entrada principal será um **botão flutuante com speed dial**, disponível no shell autenticado.

---

## 2. Problema

Hoje o usuário precisa alternar entre:

- modelos;
- documentos;
- processos;
- pesquisa jurídica;
- interpretação manual de fundamentos;
- revisão de citações;
- montagem artesanal de peças.

Isso gera:

- retrabalho;
- perda de contexto;
- baixa padronização;
- risco jurídico;
- lentidão para produzir entregáveis.

---

## 3. Objetivo do produto

Criar um workspace jurídico guiado por IA, contextual ao módulo atual, que concentre:

- entrada estruturada;
- leitura dos insumos do caso;
- organização da estratégia;
- preparação de peças e documentos;
- trilha auditável de uso.

---

## 4. Público-alvo

### Primário

- advogados;
- administradores do escritório;
- coordenação jurídica.

### Secundário

- secretarias com acesso operacional;
- super admin para governança, rollout e monetização.

### Fora do escopo inicial

- clientes finais;
- uso livre sem vínculo com contexto jurídico.

---

## 5. Casos de uso principais

1. Gerar uma petição com base no processo e nos documentos existentes.
2. Resumir um processo para leitura rápida.
3. Analisar um contrato ou decisão e extrair riscos.
4. Pesquisar precedentes e apoiar a tese.
5. Validar citações antes de usar em uma peça.
6. Sugerir próximos passos no caso.
7. Cruzar billing e auditoria para monetização da IA premium.

---

## 6. Requisitos funcionais

## 6.1 Camada de entrada

- exibir botão flutuante no shell autenticado;
- abrir speed dial vertical;
- cada ação deve ter tooltip e descrição;
- ao clicar, abrir workspace contextual;
- detectar contexto pela rota atual.

## 6.2 Ações do speed dial

### Tenant

- Nova peça
- Analisar documento
- Pesquisar jurisprudência
- Validar citações
- Resumir processo
- Estratégia do caso

### Admin

- Governança da IA
- Monetização premium
- Auditar uso
- Pesquisa jurídica assistida

## 6.3 Workspace da ação

Cada ação deve mostrar:

- contexto detectado;
- finalidade da ação;
- entregas esperadas;
- módulos já existentes que suportam a futura automação;
- status do rollout.

## 6.4 Geração de peças

Na versão completa, a geração de peças deve:

- receber tipo de peça;
- entender processo e documentos;
- montar briefing;
- sugerir estrutura;
- gerar rascunho;
- permitir revisão e versionamento;
- registrar trilha de auditoria.

## 6.5 Análise documental

Na versão completa, deve:

- resumir documento;
- extrair fatos;
- apontar riscos;
- detectar obrigações;
- preparar insumos para peça.

## 6.6 Pesquisa jurisprudencial

Na versão completa, deve:

- localizar precedentes por tema e tribunal;
- resumir entendimento;
- marcar favoráveis e contrários;
- exportar fundamentos para a peça.

## 6.7 Validação de citações

Na versão completa, deve:

- confirmar origem;
- apontar fonte;
- classificar confiança;
- impedir referência inventada.

---

## 7. Requisitos não funcionais

- isolamento por tenant;
- logs auditáveis;
- histórico por usuário;
- latência aceitável;
- política de rate limit;
- governança de prompts;
- compatibilidade com billing;
- UX premium e não invasiva.

---

## 8. Guardrails

- nenhuma resposta deve se apresentar como parecer definitivo sem revisão humana;
- citação sem confirmação não pode ser tratada como válida;
- toda geração relevante deve registrar insumos e versão do prompt;
- toda peça precisa ter histórico de versão;
- a IA não pode cruzar dados entre tenants.

---

## 9. Experiência visual

## 9.1 Botão flutuante

- fixado no shell autenticado;
- acima do dock de suporte;
- circular;
- gradiente premium;
- tooltip: `Treinada para jurídico`.

## 9.2 Speed dial

- vertical;
- microações circulares;
- tooltip lateral;
- texto auxiliar visível em telas maiores.

## 9.3 Workspace

- drawer lateral;
- leitura contextual;
- quick links úteis;
- explicação honesta do estágio da feature;
- sem mock de IA.

---

## 10. Modelo comercial

### Essencial

- IA básica controlada;
- pesquisa assistida;
- análise simples;
- volume limitado.

### Profissional

- múltiplos documentos;
- memória por caso;
- raciocínio ampliado;
- maior volume.

### Premium

- produção ilimitada de peças;
- insights proativos;
- uploads elevados ou ilimitados;
- prioridade operacional.

---

## 11. Métricas de sucesso

- adoção do dock por usuários elegíveis;
- abertura por ação;
- taxa de conversão para planos premium;
- uso por tenant;
- tempo economizado em produção de peças;
- redução de retrabalho;
- incidentes de confiança/citação;
- receita incremental da camada premium.

---

## 12. Fases

### Fase 1

- dock flutuante;
- speed dial;
- workspace contextual;
- documentação de produto;
- fundação de rollout.

### Fase 2

- geração de peças;
- análise de documentos;
- resumo de processo.

### Fase 3

- jurisprudência assistida;
- validação de citações;
- memória do caso.

### Fase 4

- insights proativos;
- sugestões de ação;
- billing e franquias maduras.

---

## 13. Dependências

- processos;
- documentos;
- petições;
- modelos;
- causas/jurisprudência;
- auditoria;
- billing;
- notificações;
- prompts versionados.

---

## 14. Entregas desta rodada

Esta rodada cobre:

- ata estratégica;
- PRD;
- checklist técnico do speed dial;
- primeira implementação do botão flutuante no shell autenticado.
