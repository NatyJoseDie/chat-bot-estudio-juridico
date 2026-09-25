-- ============================================================
-- SCHEMA SQL - SUPABASE (ESTRUCTURA REAL YA CREADA)
-- Bot de WhatsApp para Estudio Jurídico
-- ============================================================
-- NOTA: Este documento refleja las 3 tablas TAL CUAL existen en Supabase.
--       Se recomienda ejecutar PRIMERO el ALTER TABLE del punto (A) para
--       evitar fallos al guardar turnos sin fecha asignada.
-- ============================================================


-- ============================================================
-- (A) PARCHE OBLIGATORIO - EJECUTAR PRIMERO EN SUPABASE
-- ============================================================
-- Problema:  la columna `fecha_turno` en tabla `turnos` es NOT NULL, pero
--            nuestro flujo de bot NO pide fecha al usuario (un asesor la
--            coordina manualmente después).
-- Solución:  permitir NULL temporalmente. Luego el asesor completa la fecha.
ALTER TABLE public.turnos ALTER COLUMN fecha_turno DROP NOT NULL;

-- (Opcional) Si preferís NO permitir NULL y poner un default simbólico de
-- "7 días después de la solicitud", comentá el ALTER de arriba y usá este:
-- ALTER TABLE public.turnos ALTER COLUMN fecha_turno SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days');

-- (Opcional) Hacer obligatorio el cliente_id (ahora admite NULL, no tiene sentido)
ALTER TABLE public.turnos ALTER COLUMN cliente_id SET NOT NULL;

-- (Opcional) Hacer obligatorio el nombre (ahora admite NULL, no tiene sentido)
ALTER TABLE public.clientes ALTER COLUMN nombre_completo SET NOT NULL;


-- ============================================================
-- (B) TABLA: clientes
-- ============================================================
-- Estructura EXISTENTE en Supabase:
--
-- CREATE TABLE public.clientes (
--   id              UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
--   telefono        VARCHAR(20)  NOT NULL,
--   nombre_completo VARCHAR(100) NULL,
--   email           VARCHAR(100) NULL,
--   creado_en       TIMESTAMPTZ  NULL DEFAULT CURRENT_TIMESTAMP,
--   CONSTRAINT clientes_pkey PRIMARY KEY (id),
--   CONSTRAINT clientes_telefono_key UNIQUE (telefono)
-- );

-- Índices RECOMENDADOS para búsquedas rápidas (si no los tenés):
CREATE INDEX IF NOT EXISTS idx_clientes_creado_en ON public.clientes (creado_en DESC);


-- ============================================================
-- (C) TABLA: turnos
-- ============================================================
-- Estructura EXISTENTE en Supabase:
--
-- CREATE TABLE public.turnos (
--   id              UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
--   cliente_id      UUID NULL,
--   resumen_caso    TEXT NULL,
--   fecha_turno     TIMESTAMPTZ NOT NULL,
--   google_event_id VARCHAR(255) NULL,
--   estado          VARCHAR(20) NULL DEFAULT 'pendiente'::VARCHAR,
--   creado_en       TIMESTAMPTZ NULL DEFAULT CURRENT_TIMESTAMP,
--   CONSTRAINT turnos_pkey PRIMARY KEY (id),
--   CONSTRAINT turnos_cliente_id_fkey FOREIGN KEY (cliente_id)
--       REFERENCES public.clientes (id) ON DELETE CASCADE
-- );

-- Índices RECOMENDADOS (si no los tenés):
CREATE INDEX IF NOT EXISTS idx_turnos_cliente_id  ON public.turnos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_turnos_estado      ON public.turnos (estado);
CREATE INDEX IF NOT EXISTS idx_turnos_fecha_turno ON public.turnos (fecha_turno DESC);
CREATE INDEX IF NOT EXISTS idx_turnos_creado_en   ON public.turnos (creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_turnos_cliente_fecha ON public.turnos (cliente_id, creado_en DESC);


-- ============================================================
-- (D) TABLA: pagos
-- ============================================================
-- Estructura EXISTENTE en Supabase:
--
-- CREATE TABLE public.pagos (
--   id          UUID NOT NULL DEFAULT extensions.uuid_generate_v4(),
--   turno_id    UUID NULL,
--   mp_pago_id  VARCHAR(100) NULL,
--   monto       NUMERIC(10,2) NOT NULL,
--   estado      VARCHAR(20) NULL DEFAULT 'pendiente'::VARCHAR,
--   creado_en   TIMESTAMPTZ NULL DEFAULT CURRENT_TIMESTAMP,
--   CONSTRAINT pagos_pkey PRIMARY KEY (id),
--   CONSTRAINT pagos_mp_pago_id_key UNIQUE (mp_pago_id),
--   CONSTRAINT pagos_turno_id_fkey FOREIGN KEY (turno_id)
--       REFERENCES public.turnos (id) ON DELETE SET NULL
-- );

-- Índices RECOMENDADOS (si no los tenés):
CREATE INDEX IF NOT EXISTS idx_pagos_turno_id  ON public.pagos (turno_id);
CREATE INDEX IF NOT EXISTS idx_pagos_estado    ON public.pagos (estado);
CREATE INDEX IF NOT EXISTS idx_pagos_creado_en ON public.pagos (creado_en DESC);


-- ============================================================
-- (E) ROW LEVEL SECURITY (RLS) - OPCIONAL PERO RECOMENDADO
-- ============================================================
-- Como usamos SERVICE_ROLE_KEY desde el backend, RLS se bypass ea.
-- Habilitarlo es seguridad extra por si alguna vez exponés las tablas
-- directamente a un cliente frontend:
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turnos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos   ENABLE ROW LEVEL SECURITY;
