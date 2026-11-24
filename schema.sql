-- TABLA 1: Clientes (Registra a la persona que escribe por WhatsApp)
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(100),
    localidad VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TABLA 2: Consultas (Registra las fichas de los casos y sus respuestas)
CREATE TABLE IF NOT EXISTS consultas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
    tipo_consulta VARCHAR(50) NOT NULL, -- 'alimentos', 'divorcio', 'regimen', 'otro'
    es_paga BOOLEAN NOT NULL DEFAULT FALSE,
    monto DECIMAL(10,2) DEFAULT 0.00,
    estado_pago VARCHAR(20) DEFAULT 'N/A', -- 'N/A', 'pendiente', 'aprobado'
    mp_preference_id VARCHAR(100),
    respuestas_formulario JSONB, -- Almacena todas las respuestas del WhatsApp Flow
    estado_consulta VARCHAR(30) DEFAULT 'completada',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TABLA 3: Turnos (Agendamiento e integración con Google Calendar)
CREATE TABLE IF NOT EXISTS turnos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consulta_id UUID REFERENCES consultas(id) ON DELETE CASCADE,
    cliente_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
    google_event_id VARCHAR(255),
    fecha_hora TIMESTAMP WITH TIME ZONE NOT NULL,
    estado VARCHAR(30) DEFAULT 'reservado', -- 'reservado', 'confirmado', 'cancelado'
    recordatorio_24h_enviado BOOLEAN DEFAULT FALSE,
    recordatorio_2h_enviado BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);