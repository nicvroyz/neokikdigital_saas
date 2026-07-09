-- Seed Data for Neokik Digital SaaS with Operations & Communications Modules

-- Seed Sample Clients
INSERT INTO clients (
    id, name, company_name, email, phone, domain, service_type, plan_interval, amount_per_period, currency, status, last_payment_date, expiration_date, grace_period_days, doc_root
) VALUES 
(
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Papeles Concepción', 'Papeles Concepción SpA', 'contacto@papelesconcepcion.cl', '+56 9 1234 5678', 'papelesconcepcion.cl', 'HOSTING_AND_MAINTENANCE', 'MONTHLY', 89000.00, 'CLP', 'ACTIVE', CURRENT_DATE - INTERVAL '15 days', CURRENT_DATE + INTERVAL '15 days', 5, '/var/www/neokik/papelesconcepcion'
),
(
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Rabbo Restaurant', 'Rabbo Gastronomía', 'info@rabborestaurant.cl', '+56 9 8765 4321', 'rabborestaurant.cl', 'WEB_HOSTING', 'QUARTERLY', 199000.00, 'CLP', 'ACTIVE', CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE + INTERVAL '30 days', 5, '/var/www/neokik/rabborestaurant'
),
(
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'Boutique Imprenta', 'Imprenta Creativa', 'ventas@boutiqueimprenta.cl', '+56 9 5555 4444', 'boutiqueimprenta.cl', 'MAINTENANCE', 'MONTHLY', 49000.00, 'CLP', 'EXPIRED', CURRENT_DATE - INTERVAL '32 days', CURRENT_DATE - INTERVAL '2 days', 5, '/var/www/neokik/boutiqueimprenta'
) ON CONFLICT (domain) DO NOTHING;

-- Seed Sample Campaigns
INSERT INTO campaigns (id, title, message, channel, target_audience, status, created_at, sent_at)
VALUES
(
    'c1111111-1111-1111-1111-111111111111',
    'Aviso de Mantenimiento Programado Servidor VPS',
    'Estimado cliente, realizaremos una optimización de infraestructura el domingo a las 02:00 AM. Su sitio web no experimentará interrupciones.',
    'BOTH',
    'ALL_CLIENTS',
    'SENT',
    CURRENT_DATE - INTERVAL '5 days',
    CURRENT_DATE - INTERVAL '5 days'
) ON CONFLICT (id) DO NOTHING;
