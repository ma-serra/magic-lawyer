# 📚 Documentação do Magic Lawyer

Bem-vindo à documentação organizada do sistema Magic Lawyer!

## 📁 Estrutura de Documentação

### 🛠️ [Setup & Configuração](./setup/)
Guia de configuração inicial e integrações externas:
- Google Calendar
- NextAuth (autenticação)
- Email (Nodemailer)

### ✨ [Features](./features/)
Documentação detalhada de cada funcionalidade:
- **Notifications** - Sistema completo de notificações push
- **Integrações** - Visão consolidada em [INTEGRACOES_STATUS.md](./features/INTEGRACOES_STATUS.md)
- **Tenant Dashboard Enhancements** - Melhorias e funcionalidades do dashboard do tenant
- **Novo Acervo** - [FAB_NOVO_ACERVO_CHECKLIST.md](./features/novo-acervo/FAB_NOVO_ACERVO_CHECKLIST.md) descreve o botão flutuante, modal “Novo Acervo” e pipeline de OCR/IA com checklist passo a passo
- **IA Jurídica** - [ATA_ASSISTENTE_JURIDICO_PROATIVO.md](./features/juridical-ai/ATA_ASSISTENTE_JURIDICO_PROATIVO.md) define a visão do assistente jurídico proativo, geração de peças e speed dial contextual

### 🏗️ [Arquitetura](./architecture/)
Documentação técnica de arquitetura e estrutura:
- Estrutura do projeto
- Multitenancy e Realtime

### 🔧 [Infraestrutura](./infrastructure/)
Documentação de serviços externos e configurações:
- Cloudinary (armazenamento de arquivos)
- Cron Jobs (tarefas agendadas)
- Portal Comunica PJe (https://comunica.pje.jus.br/) e API Comunica PJe (https://comunicaapi.pje.jus.br/swagger/index.html#/), utilizadas para integração com o sistema PJe

### 🐛 [Correções](./fixes/)
Registro de correções de bugs e problemas:
- Fixes de decimal
- Correções de middleware
- Correções diversas

### ✅ [Checklists](./checklists/)
Checklists de desenvolvimento e validação:
- Checklist geral do projeto

### 👨‍💼 [Administração](./admin/)
Documentação administrativa do sistema

## 🚀 Início Rápido

Para começar, veja:
1. [Estrutura do Projeto](./architecture/PROJECT_STRUCTURE.md)
2. [Setup Inicial](./setup/)
3. [Checklist do Projeto](./checklists/)

## 📖 Navegação Rápida

### Por Tarefa:
- **Quero configurar o sistema** → [Setup](./setup/)
- **Quero entender uma feature** → [Features](./features/)
- **Quero entender a arquitetura** → [Architecture](./architecture/)
- **Quero ver correções** → [Fixes](./fixes/)
- **Quero ver checklists** → [Checklists](./checklists/)

## 📝 Convenções

- Arquivos de **setup** começam com instruções práticas
- Arquivos de **arquitetura** explicam decisões técnicas
- Arquivos de **features** documentam funcionalidades específicas
- Arquivos de **fixes** documentam problemas resolvidos

---

**Última atualização:** Organização completa da documentação em estrutura modular
