-- 1. إضافة عمود الرصيد لجدول العملاء لكي تعمل الزنادات وحساب الأرصدة التلقائي بالسيرفر بشكل سليم
ALTER TABLE clients ADD COLUMN IF NOT EXISTS balance NUMERIC NOT NULL DEFAULT 0;

-- 2. تحديث أرصدة العملاء الحاليين بمجموع مدفوعاتهم السابقة لمطابقة الحسابات 100%
UPDATE clients
SET balance = COALESCE((
    SELECT SUM(amount_euro)
    FROM payments
    WHERE payments.client_id = clients.id
), 0);
