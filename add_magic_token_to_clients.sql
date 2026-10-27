-- إضافة عمود التوكن السري العشوائي للروابط السحرية للزبائن
ALTER TABLE clients ADD COLUMN IF NOT EXISTS magic_token UUID DEFAULT gen_random_uuid();

-- التأكد من توليد معرّف لكل الزبائن الحاليين الذين ليس لديهم معرّف
UPDATE clients SET magic_token = gen_random_uuid() WHERE magic_token IS NULL;

-- إنشاء قيد فريد لضمان عدم تكرار أي توكن
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_magic_token ON clients(magic_token);
