-- إضافة أعمدة تسليم الخدمة النهائي في جدول الطلبات
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS delivery_file_url TEXT;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS delivery_notes TEXT;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;
