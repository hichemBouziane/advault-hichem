-- 1. إدراج دفعة تحويل سالبة لعدلان (سحب الرصيد الزائد بقيمة -28,849 دج)
WITH inserted_adlan AS (
    INSERT INTO payments (client_id, amount_dzd, amount_euro, note, date)
    VALUES (
        '2bc3e682-c22c-4827-9c5b-614a408f635e',
        -28849,
        -111.82,
        'تحويل رصيد للشريك فارس رحيم (rahim)',
        CURRENT_DATE
    )
    RETURNING id, client_id, amount_dzd
)
INSERT INTO profits_archive (payment_id, client_name, amount_received, ad_capital, total_profit, company_profit, my_profit, created_at)
SELECT 
    ia.id,
    (SELECT name FROM clients WHERE id = ia.client_id),
    ia.amount_dzd,
    ia.amount_dzd, -- كامل المبلغ كحركة رأس مال بدون أرباح جديدة
    0,
    0,
    0,
    CURRENT_TIMESTAMP
FROM inserted_adlan ia;

-- 2. إدراج دفعة تحويل موجبة لفارس رحيم (تغطية الدين المستحق بقيمة 28,826 دج)
WITH inserted_rahim AS (
    INSERT INTO payments (client_id, amount_dzd, amount_euro, note, date)
    VALUES (
        '8c92e22a-ac33-4010-8587-8ad70b149733',
        28826,
        113.49,
        'تحويل رصيد مستلم من الشريك عدلان (adlan)',
        CURRENT_DATE
    )
    RETURNING id, client_id, amount_dzd
)
INSERT INTO profits_archive (payment_id, client_name, amount_received, ad_capital, total_profit, company_profit, my_profit, created_at)
SELECT 
    ir.id,
    (SELECT name FROM clients WHERE id = ir.client_id),
    ir.amount_dzd,
    ir.amount_dzd, -- كامل المبلغ كحركة رأس مال بدون أرباح جديدة
    0,
    0,
    0,
    CURRENT_TIMESTAMP
FROM inserted_rahim ir;
