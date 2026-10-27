WITH inserted_payments AS (
    INSERT INTO payments (client_id, amount_dzd, amount_euro, note, date)
    VALUES 
    ('8c92e22a-ac33-4010-8587-8ad70b149733', 6988.8, 26.88, 'versement', '2025-01-25'),
    ('8c92e22a-ac33-4010-8587-8ad70b149733', 13905.9, 53.48, 'versement', '2025-02-26'),
    ('8c92e22a-ac33-4010-8587-8ad70b149733', 2235, 8.87, 'versement', '2025-04-26'),
    ('8c92e22a-ac33-4010-8587-8ad70b149733', 8795, 34.9, 'versement', '2025-05-10'),
    ('8c92e22a-ac33-4010-8587-8ad70b149733', 7190, 28.99, 'versement', '2025-05-26'),
    ('8c92e22a-ac33-4010-8587-8ad70b149733', 9605, 39.04, 'versement', '2025-06-02'),
    ('8c92e22a-ac33-4010-8587-8ad70b149733', 10000, 41.15, 'versement', '2025-06-20'),
    ('8c92e22a-ac33-4010-8587-8ad70b149733', 14200, 58.92, 'versement', '2025-06-27'),
    ('8c92e22a-ac33-4010-8587-8ad70b149733', 7680, 31.87, 'versement', '2025-07-08'),
    ('8c92e22a-ac33-4010-8587-8ad70b149733', 16530, 69.16, 'versement', '2025-07-22'),
    ('8c92e22a-ac33-4010-8587-8ad70b149733', 13625, 57.49, 'versement', '2025-08-09'),
    ('8c92e22a-ac33-4010-8587-8ad70b149733', 6750, 28.48, 'versement', '2025-08-19'),
    ('8c92e22a-ac33-4010-8587-8ad70b149733', 14000, 57.61, 'versement', '2025-09-18'),
    ('8c92e22a-ac33-4010-8587-8ad70b149733', 15855, 59.83, 'versement', '2025-12-01'),
    ('8c92e22a-ac33-4010-8587-8ad70b149733', 2400, 9.45, 'versement', '2025-12-19'),
    ('8c92e22a-ac33-4010-8587-8ad70b149733', 5890, 23.19, 'versement', '2026-01-03'),
    ('8c92e22a-ac33-4010-8587-8ad70b149733', 16500, 63.95, 'versement', '2026-04-16')
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
