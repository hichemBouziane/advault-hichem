-- 1. إضافة عمود مدة التنفيذ الافتراضية بالأيام لجدول الخدمات
ALTER TABLE services ADD COLUMN IF NOT EXISTS duration_days INT DEFAULT 3;

-- 2. إضافة أعمدة التوقيت وحل النزاعات لجدول طلبات الخدمات
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS due_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS dispute_reason TEXT;
