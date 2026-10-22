-- Permite cadastrar planos de serviço sem uma velocidade fictícia em Mbps.
-- Execute uma vez no SQL Editor do Supabase antes de salvar planos desse tipo.

alter table public.planos
  add column if not exists eh_servico boolean not null default false;

alter table public.planos
  alter column velocidade_mb drop not null;

-- A interface continua exigindo Mbps para planos de internet; os planos de
-- serviço são gravados com velocidade_mb = NULL.
