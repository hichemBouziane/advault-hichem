-- إضافة عمود رقم الواتساب المخصص لكل خدمة إذا لم يكن موجوداً من قبل
ALTER TABLE services ADD COLUMN IF NOT EXISTS whatsapp_phone VARCHAR(50);
