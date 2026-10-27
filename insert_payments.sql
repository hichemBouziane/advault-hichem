WITH inserted_payments AS (
    INSERT INTO payments (client_id, amount_dzd, amount_euro, note, date)
    VALUES 
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 8928, 36, 'versement', '2024-05-23'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 8498.96, 34.27, 'versement', '2024-06-01'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 6448, 26, 'versement', '2024-06-09'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 6512.976, 26.26, 'versement', '2024-07-01'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 3000, 12.10, 'versement', '2024-07-05'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 6000, 24.19, 'versement', '2024-07-14'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 9100, 36.69, 'versement', '2024-07-30'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 6400, 25.81, 'versement', '2024-08-10'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 9550, 38.51, 'versement', '2024-10-19'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 6100, 23.46, 'versement', '2024-11-21'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 13100, 48.52, 'versement', '2024-12-01'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 16000, 61.54, 'versement', '2024-12-16'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 10000, 38.76, 'versement', '2024-12-30'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 10700, 41.80, 'versement', '2025-01-09'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 29565, 113.71, 'versement', '2025-01-25'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 21300, 81.92, 'versement', '2025-02-14'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 3694, 14.21, 'versement', '2025-02-26'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 9700, 38.04, 'versement', '2025-03-23'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 30765, 122.08, 'versement', '2025-04-26'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 12705, 50.42, 'versement', '2025-05-10'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 20310, 81.90, 'versement', '2025-05-26'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 15395, 62.58, 'versement', '2025-06-02'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 14000, 57.61, 'versement', '2025-06-20'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 12800, 53.11, 'versement', '2025-06-27'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 12320, 51.12, 'versement', '2025-07-08'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 16970, 71.00, 'versement', '2025-07-22'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 4375, 18.46, 'versement', '2025-08-09'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 13250, 55.91, 'versement', '2025-08-19'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 17000, 69.96, 'versement', '2025-09-03'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 16000, 65.84, 'versement', '2025-09-24'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 25000, 98.43, 'versement', '2025-11-24'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 23145, 87.34, 'versement', '2025-12-01'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 27600, 108.66, 'versement', '2025-12-19'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 19110, 75.24, 'versement', '2026-01-03'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 8700, 34.25, 'versement', '2026-02-14'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 25000, 98.43, 'versement', '2026-05-12'),
    ('2bc3e682-c22c-4827-9c5b-614a408f635e', 10000, 38.76, 'versement', '2026-06-30')
    RETURNING id, client_id, amount_dzd, date
)
INSERT INTO profits_archive (payment_id, client_name, amount_received, ad_capital, total_profit, company_profit, my_profit, created_at)
SELECT 
    ip.id,
    (SELECT name FROM clients WHERE id = ip.client_id),
    ip.amount_dzd,
    ROUND(ip.amount_dzd * 0.8, 2),
    ROUND(ip.amount_dzd - (ip.amount_dzd * 0.8), 2),
    ROUND((ip.amount_dzd - (ip.amount_dzd * 0.8)) * 0.3, 2),
    ROUND((ip.amount_dzd - (ip.amount_dzd * 0.8)) * 0.7, 2),
    (ip.date || 'T12:00:00Z')::timestamptz
FROM inserted_payments ip;
