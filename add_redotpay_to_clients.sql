-- إضافة عمود معرف RedotPay لجدول الحسابات
ALTER TABLE clients ADD COLUMN IF NOT EXISTS redotpay_id VARCHAR(100);
