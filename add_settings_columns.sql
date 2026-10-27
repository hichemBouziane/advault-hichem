-- كود SQL لإضافة أعمدة التحكم في خصوصية عرض جداول العملاء
-- انسخ هذا الكود بالكامل والصقه في نافذة SQL Editor في لوحة تحكم Supabase ثم اضغط Run لتطبيقه

ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS show_campaigns_table BOOLEAN DEFAULT TRUE;

ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS show_payments_table BOOLEAN DEFAULT TRUE;
